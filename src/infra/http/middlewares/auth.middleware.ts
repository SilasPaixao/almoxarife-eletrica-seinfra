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
  let token = '';
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2) {
      token = parts[1];
    }
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

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

export const roleMiddleware = (roles: ('ADMIN' | 'ELECTRICIAN')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};
