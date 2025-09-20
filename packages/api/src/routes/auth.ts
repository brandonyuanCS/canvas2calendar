import { getAuthUrl, getTokenFromCode } from '../services/google-auth.js';
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
    return res.json({
      success: true,
      // TODO THIS IS ONLY DEBUG REMOVE AFTER TESTING
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date,
      },
    });
  } catch (error) {
    console.log('Error exchanging code for tokens: ', error);
    return res.status(500).json({ error: 'Failed to exchange code for tokens' });
  }
});

export default router;
