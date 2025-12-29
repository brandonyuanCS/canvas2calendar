/**
 * Canvas URL Validation Utilities
 * Validates and extracts information from Canvas ICS feed URLs
 */

export interface CanvasUrlValidation {
  isValid: boolean;
  hostname?: string;
  error?: string;
}

/**
 * Validate that a URL is a legitimate Canvas ICS feed URL
 */
export const validateCanvasUrl = (url: string): CanvasUrlValidation => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'URL must be HTTPS' };
  }

  // Domain validation: canvas.{institution}.edu
  const canvasDomains = /^canvas\.[a-z0-9-]+\.edu$/i;
  if (!canvasDomains.test(parsed.hostname)) {
    return { isValid: false, error: 'URL must be a Canvas domain (canvas.*.edu)' };
  }

  // Additional check: ensure no subdomain tricks
  const parts = parsed.hostname.split('.');
  if (parts.length !== 3 || parts[0] !== 'canvas' || !parts[2].endsWith('edu')) {
    return { isValid: false, error: 'URL must be a Canvas domain (canvas.*.edu)' };
  }

  // Path validation
  if (!parsed.pathname.startsWith('/feeds/calendars/user_')) {
    return { isValid: false, error: 'URL must be a Canvas calendar feed URL' };
  }

  // Path traversal check
  if (parsed.pathname.includes('../') || parsed.pathname.includes('..\\')) {
    return { isValid: false, error: 'Invalid path: path traversal detected' };
  }

  return {
    isValid: true,
    hostname: parsed.hostname,
  };
};

/**
 * Extract the Canvas domain from a validated URL
 * Returns the full origin for permissions
 */
export const extractCanvasDomain = (url: string): string | null => {
  const validation = validateCanvasUrl(url);
  if (!validation.isValid) {
    return null;
  }
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
};

/**
 * Build a sanitized URL for fetching
 */
export const buildSafeUrl = (url: string): string | null => {
  const validation = validateCanvasUrl(url);
  if (!validation.isValid) {
    return null;
  }

  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
};
