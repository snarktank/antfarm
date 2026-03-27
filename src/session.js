const SESSION_TTL_MS = 15 * 60 * 1000;
const SESSION_RENEWAL_WINDOW_MS = 5 * 60 * 1000;
const HTTPS_PROTOCOL = 'https';

export const sessionPolicy = {
  ttlMs: SESSION_TTL_MS,
  renewalWindowMs: SESSION_RENEWAL_WINDOW_MS,
  sameSite: 'lax'
};

export function isSecureRequest(req) {
  if (!req || typeof req !== 'object') {
    return process.env.NODE_ENV === 'production';
  }

  if (req.secure === true || req.protocol === HTTPS_PROTOCOL) {
    return true;
  }

  const forwardedProto = req.get?.('x-forwarded-proto') ?? req.headers?.['x-forwarded-proto'];

  if (typeof forwardedProto === 'string') {
    return forwardedProto
      .split(',')
      .some((value) => value.trim().toLowerCase() === HTTPS_PROTOCOL);
  }

  return Boolean(req.socket?.encrypted);
}

export function createSessionCookie({ isSecureContext = process.env.NODE_ENV === 'production' } = {}) {
  return {
    httpOnly: true,
    secure: Boolean(isSecureContext),
    sameSite: sessionPolicy.sameSite,
    maxAge: sessionPolicy.ttlMs
  };
}

export function shouldRotateSession({ issuedAt, now = Date.now() } = {}) {
  if (!Number.isFinite(issuedAt)) {
    return true;
  }

  return now - issuedAt >= sessionPolicy.renewalWindowMs;
}

export function encodeSessionValue({ issuedAt = Date.now() } = {}) {
  return Buffer.from(JSON.stringify({ issuedAt }), 'utf8').toString('base64url');
}

export function decodeSessionValue(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(rawValue, 'base64url').toString('utf8'));
    return Number.isFinite(decoded?.issuedAt) ? decoded : null;
  } catch {
    return null;
  }
}

export const sessionCookie = createSessionCookie();
