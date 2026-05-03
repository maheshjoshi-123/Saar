# Saar Final Fix Report

Date: 2026-05-03

## 1. Blueprint Compliance Score

Estimated score: **82 / 100**

The app now matches the target direction for the customer-facing video planning workspace: Next.js/Tailwind frontend, FastAPI backend, backend intelligence packet as the preferred source of truth, scene-level planning, asset upload wiring, credit wording, sticky chat-style layout, video playback in the same output card, a separated `/admin` operations panel, and clear placeholder handling when generation infrastructure is incomplete.

The main score reductions are production blockers: real auth/role enforcement is still incomplete, RunPod/R2 production configuration is intentionally untouched, ComfyUI workflow files are still placeholder JSON, PostgreSQL is not connected in the local preflight, and final GPU rendering still depends on backend/worker completion.

## 2. Files Changed

Changed during this final validation pass:

- `scripts/smoke_test.py`
- `docs/SAAR_FINAL_FIX_REPORT.md`

The smoke test was updated to expect 3 scenes and 3 keyframe references for the current 6-second ad rule.

Current worktree also contains previous uncommitted Saar fixes in:

- `apps/api/app/billing.py`
- `apps/api/app/main.py`
- `apps/api/app/preflight.py`
- `apps/api/app/prompt_refinement.py`
- `apps/api/app/reference_images.py`
- `apps/api/app/schemas.py`
- `apps/api/app/workflows.py`
- `apps/web/app/api/proxy/[...path]/route.ts`
- `apps/web/app/page.tsx`
- `apps/web/lib/api.ts`
- `apps/web/lib/session.ts`
- `apps/web/package.json`
- `apps/web/eslint.config.mjs`
- `apps/web/public/local-placeholders/*.svg`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/SAAR_BLUEPRINT_AUDIT.md`
- `docs/SECURITY_NOTES.md`
- `scripts/laptop_seller_qa.py`

Runtime local logs/databases are now kept under ignored runtime folders and should not be committed without review:

- `var/logs/`
- `var/db/`

## 3. What Now Works

- Prompt-only Direct flow has a frontend route that requests a backend intelligence packet where available and keeps frontend packet logic as preview/fallback only.
- Prompt plus image Direct flow accepts image MIME types, uploads assets before job creation, and sends compact asset context rather than raw files.
- Prompt plus video Plan flow accepts `video/mp4` and `video/webm`, uploads references, and includes returned asset IDs/URLs in packet/job requests.
- Prompt plus file Plan flow accepts `application/pdf`, uploads the file, and forwards compact asset references. Generic file semantics still need deeper backend support.
- Plan generation follows the new scene count rule in tests: a 6-second video produces 3 scenes.
- Scene cards have keyframe image areas, compact scene metadata, edit/approve/regenerate controls, and collapsed long prompt text.
- Scene edit logic updates only the selected scene/keyframe in source-level and smoke validation.
- Approved scenes are preserved by the frontend merge/status flow and verified in the laptop seller QA script.
- Generate Video calls the job path where available, polls status, and shows queued/processing/failed/placeholder states.
- Video playback supports `video_url`, `output_url`, `playbackUrl`, and `cloudflareUrl` with `<video controls playsInline src={url} />`.
- Insufficient credits open the credits/plans modal.
- Customer UI wording now uses credits instead of mixing visible tokens/credits.
- Previous output history is in a scrollable chat-style area.
- Composer remains sticky at the bottom and has a smaller textarea.
- Upload MIME whitelist exists in frontend.
- Demo session handling is centralized and access tokens are not displayed in the UI.
- Customer-facing coupon creation is not visible in the main workspace.
- Workflow placeholder warning exists in preflight and docs.

## 4. What Remains Incomplete

- `/admin` route now exists with protected proxy access, overview metrics, user summaries, coupon management, job dashboard, assets/videos list, system health, and audit-log placeholder. Backend add/remove/suspend user actions are still not implemented.
- Backend role/RLS enforcement is still a TODO-level production requirement.
- Coupon creation needs protected admin UI/backend enforcement before production use.
- Local keyframe generation currently has placeholder/fallback behavior unless a local ComfyUI/image endpoint is configured.
- Final GPU rendering is not production-complete without real RunPod, queue, worker, workflow, and R2 output wiring.
- Generic uploaded file analysis is shallow; PDFs/files are passed as compact references, not deeply parsed into creative context.
- PostgreSQL structured memory is not passing local preflight; current local runs use SQLite/test DBs.
- Public playback URL access control and expiry policy still need backend enforcement.

## 5. Production Blockers

Preflight still reports these blockers:

- `SECRET_KEY` must be unique in production.
- Callback token is missing or default.
- API auth is not production-hardened.
- Admin auth and auth separation are incomplete.
- Billing guard is incomplete for production.
- RunPod auth and endpoints are not configured.
- R2 configuration is not configured.
- PostgreSQL connection failed locally.
- Real ComfyUI API workflow JSON exports are required before production rendering. Placeholder files detected: `wan22_t2v.json`, `wan22_i2v.json`, `ltx_preview.json`, `hunyuan_premium.json`, `upscale.json`.

Security risks still to resolve before production:

- Demo-user/demo-token flow is acceptable only for local testing.
- Frontend guards must not be the only admin protection.
- Server-side upload MIME/size/content validation needs enforcement.
- User ownership checks need backend enforcement for jobs, assets, coupons, and playback URLs.
- Public video URLs need expiry, signed URL, or access policy.
- Admin, RunPod, Cloudflare/R2, and database secrets must remain server-only.

## 6. Validation Results

Passed:

- `npm.cmd --prefix apps/web run lint`
- `npm.cmd --prefix apps/web run build`
- `python -m compileall apps/api workers scripts`
- `python scripts/smoke_test.py`
- `python scripts/security_smoke_test.py`
- `python scripts/frontend_proxy_smoke.py`
- `python scripts/laptop_seller_qa.py`

Failed or unavailable:

- `npm.cmd --prefix apps/web run typecheck`
- `python -m pytest --version` failed because `pytest` is not installed in the current environment.
- `python scripts/preflight.py` ran and correctly failed on production blockers listed above.

Notes:

- The initial sandboxed `next build` failed with `spawn EPERM`; rerunning with permission to spawn Next.js worker processes passed.
- The initial sandboxed frontend proxy smoke timed out while starting the temporary Next server; rerunning with permission to spawn local API/Next processes passed.

## 7. Source-Level Flow Verification

- Prompt-only Direct: verified through frontend direct submit path and backend packet wrapper.
- Prompt + image Direct: verified through MIME whitelist, asset upload wrapper, compact asset references, and job request wiring.
- Prompt + video Plan: verified through video MIME whitelist and compact asset context passed into packet creation.
- Prompt + file Plan: verified for PDF upload/reference forwarding; deeper file understanding remains incomplete.
- Scene edit changes only selected scene: verified by source merge logic and `scripts/laptop_seller_qa.py`.
- Approved scenes remain approved: verified by frontend status/merge flow and QA script preservation checks.
- Generate video job path: verified smoke path creates/polls jobs; placeholder state appears if backend output URL is absent.
- Video URL display: verified source supports known URL fields and renders video inside output cards.
- Credits modal on insufficient balance: verified source opens plans modal when balance is low.
- Previous outputs scrollable: verified source uses scrollable output container.
- Composer bottom-fixed: verified source uses sticky bottom composer.
- No obvious frontend secret exposure: verified source scan found no RunPod/R2/database secrets in client UI. Server proxy references admin/API tokens only through server-side environment variables.

## 8. Next Recommended Implementation Phase

1. Add real backend auth with user roles, admin role enforcement, and server-side ownership checks.
2. Replace placeholder ComfyUI workflows with real exported API workflow JSON and validate node contracts.
3. Wire RunPod worker completion to R2 upload and return stable `playbackUrl`/`output_url`.
4. Add server-side upload validation, file size limits, malware/content checks, and signed playback URLs.
5. Install/configure pytest if Python test coverage is expected.
6. Expand E2E tests around Direct, Plan, scene edit preservation, approval preservation, asset upload, credit gating, admin tools, and video playback.
