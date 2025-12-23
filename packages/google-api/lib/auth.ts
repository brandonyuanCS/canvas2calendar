/**
 * Google Authentication Utilities
 * Uses chrome.identity API for OAuth token management
 */

import type { GoogleUserInfo, GoogleApiError } from './types.js';

/**
 * Chrome reference - may be undefined during build/test
 */
const chrome = globalThis.chrome;

/**
 * Get an OAuth token using chrome.identity
 * This replaces the server-side OAuth flow entirely
 */
export const getAuthToken = async (interactive = true): Promise<string> => {
  if (!chrome?.identity) {
    throw new Error('chrome.identity API not available');
  }

  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      // Handle both old (string) and new (object) return types
      const token = typeof result === 'string' ? result : result?.token;
      if (!token) {
        reject(new Error('No token returned from chrome.identity'));
        return;
      }
      resolve(token);
    });
  });
};

/**
 * Remove cached token (for re-authentication or logout)
 */
export const removeCachedToken = async (token: string): Promise<void> => {
  if (!chrome?.identity) {
    throw new Error('chrome.identity API not available');
  }

  return new Promise(resolve => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
};

/**
 * Clear all cached tokens (for full logout)
 */
export const clearAllCachedTokens = async (): Promise<void> => {
  if (!chrome?.identity) {
    throw new Error('chrome.identity API not available');
  }

  return new Promise((resolve, reject) => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
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
      await removeCachedToken(token);
      throw new Error('Token expired. Please re-authenticate.');
    }

    throw new Error(error.error?.message || `Google API error: ${response.status}`);
  }

  return data as T;
};
