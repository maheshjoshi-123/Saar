# Security Notes

This document captures focused security findings that must stay visible before production.

## Frontend Secrets

- Do not expose RunPod keys, Cloudflare/R2 secrets, database secrets, API bearer tokens, or admin bearer tokens in client components.
- The Next.js proxy may read server-side `SAAR_API_TOKEN`, `SAAR_ADMIN_TOKEN`, and `SAAR_ADMIN_UI_KEY`, but those values must never be moved to `NEXT_PUBLIC_*`.
- Access tokens must not be displayed in UI. Frontend session persistence should avoid storing user tokens in `localStorage`.

## Uploads

- Customer-facing upload MIME whitelist is limited to:
  - `image/png`
  - `image/jpeg`
  - `image/webp`
  - `video/mp4`
  - `video/webm`
  - `application/pdf`
- Backend presign checks declared content type and size.
- TODO: add server-side MIME sniffing, malware scanning, and post-upload validation before accepting customer uploads in production.

## User Ownership

- Production must run with `USER_AUTH_ENFORCED=true` and `USER_AUTH_SECRET` set.
- If `USER_AUTH_ENFORCED=false`, users can provide arbitrary `user_id` values in shared environments.
- Ownership checks exist for job, wallet, memory, prompt, revision, feedback, and input asset flows, but they depend on enforced user auth for production-grade isolation.

## Playback URLs

- Public playback URLs are convenient for MVP testing, but any user with the URL may be able to view the generated video.
- TODO: use signed/expiring playback URLs or private object access if generated videos must be private.

## Demo Sessions

- Demo auth and demo credits are for local QA only.
- Production must disable demo auth and mock payments.
