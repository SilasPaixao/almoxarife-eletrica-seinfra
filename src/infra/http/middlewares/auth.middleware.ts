import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../auth/TokenService.ts';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: 'ADMIN' | 'ELECTRICIAN';
    username: string;
    name: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const [, token] = authHeader.split(' ');
  const decoded = TokenService.verify(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded;
  next();
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};
