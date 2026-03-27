# Secret Rotation Notes

The previously committed API key, admin password, and JWT secret were removed from tracked source files and must be rotated before deployment.

Rotate and store these secrets in your environment or secret manager:
- `API_KEY`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

Do not commit live values to the repository. Use `.env.example` only as a placeholder template.
