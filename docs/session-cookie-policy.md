# Session cookie policy

The application issues the `sid` session cookie with a restrictive default policy:

- `HttpOnly` is always enabled to block JavaScript access.
- `SameSite=Lax` is the default to prevent cross-site request contexts unless a documented product requirement needs something stricter.
- `Secure` is enabled automatically for TLS requests, including deployments behind a proxy that forwards `X-Forwarded-Proto: https`.
- `Max-Age=900` seconds (15 minutes) bounds session lifetime.
- Sessions are rotated after 5 minutes or sooner if the existing cookie is missing or malformed.

This keeps session cookies non-scriptable, scoped to secure transport, and short-lived by default.
