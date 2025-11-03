// Ensure .env is loaded before importing services
import '../lib/env.js';

import { prisma } from '../lib/prisma.js';
import { generateToken } from '../services/auth.service.js';
import { getAuthUrl, getTokenFromCode, getUserInfo } from '../services/google.service.js';
import { Router } from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const router = Router();

// Get paths to HTML files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const errorHtmlPath = join(__dirname, '../../../../pages/popup/src/auth-callback-error.html');

// Read HTML templates
const getErrorHtml = (errorMessage: string) => {
  try {
    const html = readFileSync(errorHtmlPath, 'utf-8');
    return html.replace('{{ERROR_MESSAGE}}', errorMessage);
  } catch (error) {
    console.error('Error reading error HTML file:', error);
    // Fallback HTML
    return `
      <!DOCTYPE html>
      <html>
      <head><title>Authentication Error</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 2rem;">
        <h1 style="color: #dc2626;">Authentication Error</h1>
        <p>${errorMessage}</p>
        <p>You can close this window and try again.</p>
      </body>
      </html>
    `;
  }
};

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
  const acceptsJson = req.headers.accept?.includes('application/json');

  if (error) {
    if (acceptsJson) {
      return res.status(400).json({ error: `Error occurred during OAuth login: ${error}` });
    }
    return res.status(400).send(getErrorHtml(`Error occurred during OAuth login: ${error}`));
  }

  if (!code || typeof code !== 'string') {
    if (acceptsJson) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    return res.status(400).send(getErrorHtml('Authorization code is required.'));
  }

  try {
    const tokens = await getTokenFromCode(code);
    const userInfo = await getUserInfo(tokens);

    if (!userInfo.data.id || !userInfo.data.email) {
      if (acceptsJson) {
        return res.status(400).json({ error: 'Failed to get user info from Google' });
      }
      return res.status(400).send(getErrorHtml('Failed to get user info from Google.'));
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

    // generate JWT
    const jwtToken = generateToken(user.id);

    // Return JSON if explicitly requested (for API clients)
    if (acceptsJson) {
      return res.json({
        success: true,
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    // Otherwise return HTML success page with JWT in fragment for extension to read
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful - Canvas2Calendar</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background: white; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; max-width: 450px; }
          .success-icon { width: 64px; height: 64px; margin: 0 auto 1.5rem; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
          .success-icon svg { width: 36px; height: 36px; stroke: white; fill: none; stroke-width: 3; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.75rem; color: #111827; }
          p { margin: 0.5rem 0; color: #6b7280; line-height: 1.6; }
          .email { font-weight: 600; color: #374151; }
          .close-note { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Authentication Successful!</h1>
          <p>You have successfully connected your Google account.</p>
          <p class="email">${userInfo.data.email}</p>
          <p class="close-note">This window will close automatically...</p>
        </div>
        <script>
          // Put the token and email into the URL fragment so the extension can read it
          location.hash = '#jwt=' + encodeURIComponent('${jwtToken}') + '&email=' + encodeURIComponent('${userInfo.data.email}');
          // Close after a moment to give the extension time to read it
          setTimeout(() => window.close(), 1500);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.log('Error exchanging code for tokens: ', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to exchange code for tokens';

    if (acceptsJson) {
      return res.status(500).json({ error: errorMessage });
    }

    return res.status(500).send(getErrorHtml(errorMessage));
  }
});

export default router;
