import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../services/auth.service.js';
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
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }

    // attach user to the request
    req.user = user;
    next();

    return;
  } catch (error) {
    console.error('Auth middleware error: ', error);
    return res.status(500).json({ error: 'Authentication middleware failed' });
  }
};
