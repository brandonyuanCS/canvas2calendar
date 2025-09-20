import { google } from 'googleapis';
import type { Auth } from 'googleapis';

let oauth2Client: Auth.OAuth2Client | null = null;
const getOAuth2Client = (): Auth.OAuth2Client => {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }
  return oauth2Client;
};

export const getAuthUrl = () => {
  const client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/tasks'];
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
  });
};

export const getTokenFromCode = async (code: string) => {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
};

export { oauth2Client };
