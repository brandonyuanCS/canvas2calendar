import { google } from 'googleapis';
import type { Auth } from 'googleapis';

const createOAuth2Client = (): Auth.OAuth2Client =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

export const getAuthUrl = () => {
  const client = createOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
};

export const getTokenFromCode = async (code: string): Promise<Auth.Credentials> => {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
};

export const getUserInfo = async (tokens: Auth.Credentials) => {
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  return await oauth2.userinfo.get();
};
