import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../services/auth.service.js';
import { refreshAccessToken } from '../services/google.service.js';
import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        google_access_token: string | null;
        google_refresh_token: string | null;
        google_token_expires_at: Date | null;
      };
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        google_access_token: true,
        google_refresh_token: true,
        google_token_expires_at: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.google_access_token) {
      return res.status(401).json({
        error: 'User not authenticated with Google',
        code: 'GOOGLE_AUTH_REQUIRED',
      });
    }

    // stricter by 5 minutes, can change later
    const now = new Date();
    const expiryDate = user.google_token_expires_at;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiryDate && expiryDate <= fiveMinutesFromNow) {
      try {
        if (user.google_refresh_token === null) {
          return res.status(404).json({ error: 'no refresh token' });
        }
        const newTokens = await refreshAccessToken(user.google_refresh_token);
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            google_access_token: newTokens.access_token,
            google_token_expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
          },
          select: {
            id: true,
            email: true,
            google_access_token: true,
            google_refresh_token: true,
            google_token_expires_at: true,
          },
        });

        req.user = updatedUser;
        next();
        return;
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        return res.status(401).json({
          error: 'Google authentication expired. Please re-authenticate.',
          code: 'GOOGLE_TOKEN_REFRESH_FAILED',
        });
      }
    }

    // Token is still valid, attach user to request
    req.user = user;
    next();
    return;
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication middleware failed' });
  }
};
