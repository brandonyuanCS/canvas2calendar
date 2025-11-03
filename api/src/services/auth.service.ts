// I disabled linting because ESLint is struggling w/ named imports
/* eslint-disable import-x/no-named-as-default-member */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Error: JWT_SECRET is not defined in .env');
}

interface JwtPayload {
  userId: number;
}

export const generateToken = (userId: number): string => {
  const payload: JwtPayload = { userId };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
};

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return decoded as JwtPayload;
    }

    console.error('Invalid token payload structure');
    return null;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        console.error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        console.error('Invalid token:', error.message);
      } else {
        console.error('Token verification error:', error);
      }
    }
    return null;
  }
};
