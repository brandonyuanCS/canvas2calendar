import crypto from 'crypto';

export const generateEventHash = (event: {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
  location?: string;
}): string => {
  // Hash key properties to detect changes
  const hashInput = JSON.stringify({
    uid: event.uid,
    summary: event.summary,
    dtstart: event.dtstart.toISOString(),
    dtend: event.dtend.toISOString(),
    description: event.description || '',
    location: event.location || '',
  });
  return crypto.createHash('sha256').update(hashInput).digest('hex');
};
