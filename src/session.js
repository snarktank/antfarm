const SESSION_TTL_MS = 15 * 60 * 1000;
const SESSION_RENEWAL_WINDOW_MS = 5 * 60 * 1000;

export const sessionPolicy = {
  ttlMs: SESSION_TTL_MS,
  renewalWindowMs: SESSION_RENEWAL_WINDOW_MS,
  sameSite: 'lax'
};

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

export const sessionCookie = createSessionCookie();
