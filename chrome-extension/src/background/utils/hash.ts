/**
 * Browser-compatible Hashing Utility
 * Uses Web Crypto API (crypto.subtle) instead of Node's crypto module
 */

export interface HashableEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
  location?: string;
}

/**
 * Generate a SHA-256 hash of an event's key properties
 * Used to detect changes in Canvas events
 */
export const generateEventHash = async (event: HashableEvent): Promise<string> => {
  const hashInput = JSON.stringify({
    uid: event.uid,
    summary: event.summary,
    dtstart: event.dtstart.toISOString(),
    dtend: event.dtend.toISOString(),
    description: event.description || '',
    location: event.location || '',
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
