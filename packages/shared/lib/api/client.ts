const getApiBaseUrl = (): string => {
  // Use environment variable in build time (Vite), fallback to localhost for dev
  try {
    const viteEnv = (import.meta as { env?: { VITE_API_URL?: string } }).env;
    if (viteEnv?.VITE_API_URL) {
      return viteEnv.VITE_API_URL;
    }
  } catch {
    // not in vite context, default to localhost
  }
  return 'http://localhost:3001/api';
};

/**
 * Retrieves the authentication token from chrome.storage.local
 */
const getToken = (): Promise<string | null> =>
  new Promise(resolve => {
    chrome.storage.local.get(['token'], result => {
      resolve(result.token || null);
    });
  });

/**
 * Core API client class
 */
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getApiBaseUrl();
  }

  /**
   * Makes an authenticated API request
   * Automatically retrieves token from chrome.storage.local
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If response isn't JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses (e.g., 204 No Content)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Makes an unauthenticated API request (for public endpoints like OAuth)
   */
  async requestPublic<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Updates the base URL (useful for testing or different environments)
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Gets the current base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const apiClient = new ApiClient();
