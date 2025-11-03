import { google } from 'googleapis';
import type { Auth } from 'googleapis';

interface UserTokens {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date?: number | null;
}

export const createOAuth2Client = (): Auth.OAuth2Client =>
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

export const refreshAccessToken = async (refreshToken: string) => {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const client = createOAuth2Client();
  client.setCredentials({
    refresh_token: refreshToken,
  });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    return {
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date || null,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw new Error('Failed to refresh Google access token. User may need to re-authenticate.');
  }
};

// for calendar + task services
export const getGoogleCalendarClient = (tokens: UserTokens) => {
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  return google.calendar({ version: 'v3', auth: client });
};

export const getGoogleTasksClient = (tokens: UserTokens) => {
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  return google.tasks({ version: 'v1', auth: client });
};
