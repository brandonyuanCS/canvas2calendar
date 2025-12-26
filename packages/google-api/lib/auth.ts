/**
 * Google Authentication Utilities
 * Uses chrome.identity.launchWebAuthFlow for OAuth
 * This approach works with Web Application OAuth clients
 */

import type { GoogleUserInfo, GoogleApiError } from './types.js';

const chrome = globalThis.chrome;
const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] || '';
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid', // Required for id_token
];
const TOKEN_STORAGE_KEY = 'google_access_token';
const TOKEN_EXPIRY_KEY = 'google_token_expiry';
const ID_TOKEN_STORAGE_KEY = 'google_id_token';
const NONCE_STORAGE_KEY = 'google_oauth_nonce';

const getRedirectUrl = (): string => chrome.identity.getRedirectURL();

/**
 * Store nonce for later verification with Supabase
 */
const storeNonce = async (nonce: string): Promise<void> =>
  new Promise(resolve => {
    chrome.storage.local.set({ [NONCE_STORAGE_KEY]: nonce }, resolve);
  });

const buildAuthUrl = async (): Promise<string> => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not set');
  }

  const redirectUrl = getRedirectUrl();
  // Generate and store nonce for Supabase verification
  const nonce = crypto.randomUUID();
  await storeNonce(nonce);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUrl,
    response_type: 'token id_token', // Request both access token and ID token
    scope: OAUTH_SCOPES.join(' '),
    prompt: 'consent', // Always show consent screen for clarity
    nonce: nonce, // Required for id_token - stored for Supabase verification
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Extract access token and ID token from redirect URL
 */
const extractTokenFromUrl = (url: string): { token: string; idToken: string | null; expiresIn: number } | null => {
  try {
    const hashParams = new URL(url).hash.substring(1);
    const params = new URLSearchParams(hashParams);
    const token = params.get('access_token');
    const idToken = params.get('id_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

    if (token) {
      return { token, idToken, expiresIn };
    }
  } catch {
    // URL parsing failed
  }
  return null;
};

/**
 * Get stored token if still valid
 */
const getStoredToken = async (): Promise<string | null> =>
  new Promise(resolve => {
    chrome.storage.local.get([TOKEN_STORAGE_KEY, TOKEN_EXPIRY_KEY], result => {
      const token = result[TOKEN_STORAGE_KEY];
      const expiry = result[TOKEN_EXPIRY_KEY];

      if (token && expiry && Date.now() < expiry) {
        resolve(token);
      } else {
        resolve(null);
      }
    });
  });

/**
 * Store token with expiry (and optionally ID token)
 */
const storeToken = async (token: string, expiresIn: number, idToken?: string | null): Promise<void> => {
  // Store with 5 minute buffer before expiry
  const expiry = Date.now() + (expiresIn - 300) * 1000;

  const data: Record<string, unknown> = {
    [TOKEN_STORAGE_KEY]: token,
    [TOKEN_EXPIRY_KEY]: expiry,
  };

  if (idToken) {
    data[ID_TOKEN_STORAGE_KEY] = idToken;
  }

  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve);
  });
};

/**
 * Clear stored token (including ID token and nonce)
 */
const clearStoredToken = async (): Promise<void> =>
  new Promise(resolve => {
    chrome.storage.local.remove(
      [TOKEN_STORAGE_KEY, TOKEN_EXPIRY_KEY, ID_TOKEN_STORAGE_KEY, NONCE_STORAGE_KEY],
      resolve,
    );
  });

/**
 * Get an OAuth token using launchWebAuthFlow
 * Opens a popup for user to authenticate with Google
 */
export const getAuthToken = async (interactive = true): Promise<string> => {
  if (!chrome?.identity) {
    throw new Error('chrome.identity API not available');
  }

  // Try to use cached token first
  const cachedToken = await getStoredToken();
  if (cachedToken) {
    return cachedToken;
  }

  // If not interactive and no cached token, fail
  if (!interactive) {
    throw new Error('No cached token available and interactive mode disabled');
  }

  // Launch OAuth flow
  const authUrl = await buildAuthUrl();

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async responseUrl => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!responseUrl) {
        reject(new Error('No response URL from OAuth flow'));
        return;
      }

      const tokenData = extractTokenFromUrl(responseUrl);
      if (!tokenData) {
        reject(new Error('Failed to extract token from OAuth response'));
        return;
      }

      // Store token for future use (including ID token for Supabase)
      await storeToken(tokenData.token, tokenData.expiresIn, tokenData.idToken);

      resolve(tokenData.token);
    });
  });
};

/**
 * Remove cached token (for re-authentication or logout)
 */
export const removeCachedToken = async (): Promise<void> => {
  await clearStoredToken();
};

/**
 * Clear all cached tokens (for full logout)
 */
export const clearAllCachedTokens = async (): Promise<void> => {
  await clearStoredToken();
};

/**
 * Get user info from Google OAuth2 API
 */
export const getUserInfo = async (): Promise<GoogleUserInfo> => {
  const token = await getAuthToken();

  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = (await response.json()) as GoogleApiError;
    throw new Error(error.error?.message || 'Failed to get user info');
  }

  return response.json();
};

/**
 * Base fetch wrapper for Google APIs with authentication
 */
export const googleFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = await getAuthToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 204 No Content (common for DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    const error = data as GoogleApiError;

    // Handle token expiration
    if (response.status === 401) {
      await removeCachedToken();
      throw new GoogleApiException('Token expired. Please re-authenticate.', 401);
    }

    throw new GoogleApiException(error.error?.message || `Google API error: ${response.status}`, response.status);
  }

  return data as T;
};

/**
 * Custom error class for Google API errors with status code
 */
export class GoogleApiException extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleApiException';
  }

  /**
   * Check if the error is a "Not Found" error (resource deleted externally)
   */
  isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * Check if the error is a "Gone" error (resource permanently deleted)
   */
  isGone(): boolean {
    return this.status === 410;
  }
}

/**
 * Get stored nonce (for Supabase auth)
 */
export const getStoredNonce = async (): Promise<string | null> =>
  new Promise(resolve => {
    chrome.storage.local.get([NONCE_STORAGE_KEY], result => {
      resolve(result[NONCE_STORAGE_KEY] || null);
    });
  });

/**
 * Get stored ID token (for Supabase auth)
 */
export const getStoredIdToken = async (): Promise<string | null> =>
  new Promise(resolve => {
    chrome.storage.local.get([ID_TOKEN_STORAGE_KEY], result => {
      resolve(result[ID_TOKEN_STORAGE_KEY] || null);
    });
  });

/**
 * Get the redirect URL for debugging/setup purposes
 */
export const getOAuthRedirectUrl = (): string => {
  if (!chrome?.identity) {
    return 'chrome.identity not available';
  }
  return getRedirectUrl();
};
