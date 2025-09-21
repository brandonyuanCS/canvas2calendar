import { prisma } from '../lib/prisma.js';
import { getAuthUrl, getTokenFromCode, getUserInfo } from '../services/google-auth.js';
import { Router } from 'express';

const router = Router();

router.get('/google', (req, res) => {
  try {
    const authUrl = getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL: ', error);
    res.status(500).json({ error: 'Failure generating auth URL' });
  }
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).json({ error: `Error occurred during OAuth login: ${error}` });
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokens = await getTokenFromCode(code);
    const userInfo = await getUserInfo(tokens);

    if (!userInfo.data.id || !userInfo.data.email) {
      return res.status(400).json({ error: 'Failed to get user info from Google' });
    }
    const user = await prisma.user.upsert({
      where: { google_user_id: userInfo.data.id },
      update: {
        email: userInfo.data.email,
        google_access_token: tokens.access_token || null,
        google_refresh_token: tokens.refresh_token || null,
        google_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        google_user_id: userInfo.data.id,
        email: userInfo.data.email,
        google_access_token: tokens.access_token || null,
        google_refresh_token: tokens.refresh_token || null,
        google_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    // TODO delete after testing
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        google_user_id: user.google_user_id,
      },
    });
  } catch (error) {
    console.log('Error exchanging code for tokens: ', error);
    return res.status(500).json({ error: 'Failed to exchange code for tokens' });
  }
});

export default router;
