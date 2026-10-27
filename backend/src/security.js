import jwt from 'jsonwebtoken';

const cookieName = 'drp_admin';
const userCookieName = 'drp_user';

export function signInCookie(res, admin) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const token = jwt.sign({ sub: admin.id, role: admin.role, email: admin.email }, secret, { expiresIn: '8h' });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    path: '/'
  });
}

export function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.[cookieName];
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}

export function requireEditorOrAdmin(req, res, next) {
  if (!req.admin || !['admin', 'editor'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'You do not have permission to do this.' });
  }
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  };
}

export function signInUserCookie(res, user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const token = jwt.sign({ sub: user.id, type: 'user', email: user.email }, secret, { expiresIn: '8h' });
  res.cookie(userCookieName, token, cookieOptions());
}

export function clearUserCookie(res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(userCookieName, options);
}

export function requireUser(req, res, next) {
  try {
    const token = req.cookies?.[userCookieName];
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'user') return res.status(401).json({ error: 'Please sign in.' });
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}
