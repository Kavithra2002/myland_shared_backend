import jwt from 'jsonwebtoken';
import { findActiveUserById, jwtSecret, publicUser } from './users.js';

function readToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

export async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) {
    req.user = null;
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    const row = await findActiveUserById(payload.userId);
    req.user = row ? publicUser(row) : null;
  } catch {
    req.user = null;
  }
  next();
}

export async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: 'Please sign in.' });
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    const row = await findActiveUserById(payload.userId);
    if (!row) {
      res.status(401).json({ message: 'Please sign in.' });
      return;
    }
    req.user = publicUser(row);
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required.' });
    return;
  }
  next();
}
