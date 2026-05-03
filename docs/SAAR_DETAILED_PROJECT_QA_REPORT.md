# Saar AI Video Production Factory - Detailed Current Project QA Report

Date: 2026-05-03  
Environment tested: local Windows development workspace  
Repository root: `C:\Users\Test\Documents\Codex\2026-05-01\find-me-a-project-from-github`

## 1. Executive Summary

The Saar AI Video Production Factory is currently a working local MVP for an AI video production workspace with:

- Next.js + Tailwind customer frontend
- FastAPI backend
- backend intelligence packet generation
- scene plan/keyframe prompt generation
- local placeholder keyframes
- model/workflow routing abstraction
- mock RunPod generation path
- Cloudflare R2 integration interfaces
- development-only mock asset upload fallback
- customer credits/plans/coupon redemption
- protected `/admin` operations panel
- smoke/security/proxy/QA scripts

Local QA status: **usable for demo and development with mocked RunPod and local mock uploads.**

Production status: **not production-ready until real secrets, PostgreSQL, R2, RunPod endpoints, auth/payment, and real ComfyUI workflow exports are configured.**

## 2. Local Servers Currently Running

API:

- URL: `http://127.0.0.1:8000`
- Health: `http://127.0.0.1:8000/health`
- Docs: `http://127.0.0.1:8000/docs`
- Process observed on port `8000`: PID `20888`

Frontend:

- URL: `http://127.0.0.1:3000`
- Admin route: `http://127.0.0.1:3000/admin`
- Proxy health: `http://127.0.0.1:3000/api/proxy/health`
- Process observed on port `3000`: PID `7828`

Manual local admin UI key used for QA:

- `manual-admin-key`

This key is only for the current local server process. Backend admin tokens are not exposed to the frontend.

## 3. Exact Local Run Configuration

The API was run with local-safe environment variables:

```powershell
DATABASE_URL=sqlite:///var/db/saar_manual_qa.db
QUEUE_MODE=inline
RUNPOD_MOCK=true
WORKFLOW_DIR=workflows
SECRET_KEY=manual-qa-secret-key-please-do-not-use-prod
INTERNAL_CALLBACK_TOKEN=manual-qa-callback-token
API_AUTH_TOKEN=manual-api-token
ADMIN_AUTH_TOKEN=manual-admin-token
USER_AUTH_SECRET=manual-user-secret
SAAR_ENV=development
OLLAMA_ENABLED=false
```

The web server was run with:

```powershell
SAAR_API_URL=http://127.0.0.1:8000
SAAR_API_TOKEN=manual-api-token
SAAR_ADMIN_TOKEN=manual-admin-token
SAAR_ADMIN_UI_KEY=manual-admin-key
NEXT_PUBLIC_API_URL=/api/proxy
```

## 4. How To Reproduce This Local QA Setup

From the repository root:

```powershell
$env:DATABASE_URL='sqlite:///var/db/saar_manual_qa.db'
$env:QUEUE_MODE='inline'
$env:RUNPOD_MOCK='true'
$env:WORKFLOW_DIR='workflows'
$env:SECRET_KEY='manual-qa-secret-key-please-do-not-use-prod'
$env:INTERNAL_CALLBACK_TOKEN='manual-qa-callback-token'
$env:API_AUTH_TOKEN='manual-api-token'
$env:ADMIN_AUTH_TOKEN='manual-admin-token'
$env:USER_AUTH_SECRET='manual-user-secret'
$env:SAAR_ENV='development'
$env:OLLAMA_ENABLED='false'
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000
```

In another shell:

```powershell
cd apps/web
$env:SAAR_API_URL='http://127.0.0.1:8000'
$env:SAAR_API_TOKEN='manual-api-token'
$env:SAAR_ADMIN_TOKEN='manual-admin-token'
$env:SAAR_ADMIN_UI_KEY='manual-admin-key'
$env:NEXT_PUBLIC_API_URL='/api/proxy'
npm.cmd run dev -- -p 3000
```

Important: do not run `next build` while `next dev` is serving from the same `.next` directory. If that happens, stop the dev server, delete `apps/web/.next`, and restart `next dev`.

## 5. Repository Structure

Current useful layout:

```text
apps/
  api/
    app/
      main.py                 FastAPI app and routes
      router.py               central model/workflow routing
      generation_packet.py    normalized generation packet contract
      tasks.py                RunPod/job execution path
      r2.py                   Cloudflare/R2 URL and presign helpers
      media_pipeline.py       upscale/compression/poster service interfaces
      reference_images.py     keyframe prompt/image placeholder service
      billing.py              plans, wallet, coupons, credits
      schemas.py              request/response contracts
  web/
    app/page.tsx              customer workspace
    app/admin/page.tsx        protected admin workspace
    app/api/proxy/[...path]   Next server-side API/admin proxy
    lib/api.ts                customer API client/types
    lib/admin.ts              admin API client/types
    lib/session.ts            demo session helper
docs/
  architecture, audit, security, deployment and QA reports
infra/
  docker-compose.yml
scripts/
  smoke/security/frontend proxy/live QA scripts
var/
  db/                         ignored local SQLite databases
  logs/                       ignored local logs
  uploads/                    ignored local mock upload files
workers/
  runpod-comfyui/             RunPod serverless worker
workflows/
  ComfyUI API workflow placeholders
```

## 6. Main Functional QA Results

### 6.1 Customer Frontend

Checked by HTTP render and backend/proxy flow:

- `/` returns `200`
- current dark UI remains in place
- chat/output flow remains in place
- composer remains bottom-fixed in source
- generated outputs remain above composer in source
- no separate right preview panel is present
- output cards support video playback fields

Limit: no browser automation plugin was available in this session, so visual checks were HTTP/source-level rather than screenshot-based.

### 6.2 Admin Frontend

Checked:

- `/admin` returns `200`
- admin route is separate from customer workspace
- admin proxy without key returns `403`
- admin proxy with `manual-admin-key` returns usage data
- admin panel includes sections for:
  - overview metrics
  - users
  - coupons
  - jobs
  - assets/videos
  - system health
  - audit-log placeholder

Live admin API result after QA:

```json
{
  "total_jobs": 3,
  "completed_jobs": 1,
  "failed_jobs": 2,
  "running_jobs": 0,
  "jobs_by_task": {
    "fast_preview": 1,
    "image_to_video": 1,
    "text_to_video_quality": 1
  },
  "jobs_by_model": {
    "ltx_preview": 1,
    "wan22_i2v": 1,
    "wan22_t2v": 1
  }
}
```

The two failed jobs were from before the mock input-asset fix. Retesting after the fix showed image/video jobs complete.

### 6.3 Demo Auth / Session

Live result:

- demo signup works
- user receives local Pro tier
- wallet starts at `100` credits
- backend returns a token for scoped calls when `USER_AUTH_SECRET` is set
- frontend session helper does not display tokens in UI and avoids persisting token in local storage

QA user:

- `qa-live-user`

### 6.4 Direct Video

Live direct packet result:

- route: `direct_video`
- packet status: `ready_for_video_generator`
- required credits: `5`
- source of truth: backend packet
- job model for prompt-only direct: `wan22_t2v`
- final completed job returned:
  - `output_url`
  - `playbackUrl`
  - `cloudflareUrl`
  - `download_url`

Mock output URL:

- `https://example.com/mock-saar-output.mp4`

### 6.5 Generate Plan

Live plan result:

- 10-second prompt produced `5` scenes
- keyframes produced: `4`
- first keyframe image path: `/local-placeholders/reference-scene-1.svg`
- each scene has description/camera/motion/lighting/reference prompt in backend packet
- local image generation status remains placeholder unless real local image workflow is configured

### 6.6 Scene-Specific Revision

Validated by `scripts/laptop_seller_qa.py`:

- scene 2 edit changed only scene 2
- scene 1 remained unchanged
- keyframe 1 remained unchanged
- revised target keyframe retained history

### 6.7 Asset Upload

Issue found:

- local attachment upload was not testable without R2 credentials because `/api/assets/presign-upload` tried to call Cloudflare presign and returned `500`.

Fix applied:

- added development-only mock upload fallback when `RUNPOD_MOCK=true` and environment is not production-like
- production still requires real R2 credentials
- mock files are stored under `var/uploads`
- mock public files are served through `/api/assets/mock-file/{asset_id}`

Live verification:

```json
{
  "upload_status": 200,
  "file_status": 200,
  "public_url": "http://localhost:3000/api/proxy/api/assets/mock-file/<asset_id>"
}
```

### 6.8 Image-To-Video Routing

Live test:

- uploaded mock image
- created job with requested `text_to_video_quality`
- router selected:
  - task: `image_to_video`
  - model: `wan22_i2v`
- after mocked input-asset fix, job completed

Result:

```json
{
  "image_job_task": "image_to_video",
  "image_job_model": "wan22_i2v",
  "image_job_status": "completed"
}
```

### 6.9 Video Reference Routing

Live test:

- uploaded mock video
- created job with requested `text_to_video_quality`
- router selected:
  - task: `fast_preview`
  - model: `ltx_preview`
  - future mode: video-to-video fallback
- after mocked input-asset fix, job completed

Result:

```json
{
  "video_job_task": "fast_preview",
  "video_job_model": "ltx_preview",
  "video_job_status": "completed"
}
```

### 6.10 Credits / Coupons

Validated:

- demo signup grants `100` credits
- coupon creation works from admin endpoint
- coupon disable works from admin endpoint
- coupon redemption works from customer endpoint
- insufficient-credit handling is implemented in customer UI source

Admin live coupon test:

```json
{
  "coupon_created": "LIVEQA10",
  "coupon_disabled": true
}
```

## 7. Model Routing / Packet System

Central routing is in `apps/api/app/router.py`.

Implemented selectors:

- `selectPlanningModel()`
- `selectImageGenerationModel()`
- `selectVideoGenerationModel()`
- `selectUpscaleWorkflow()`
- `selectCompressionWorkflow()`

Current routing rules:

- planning: Saar intelligence compiler/refiner
- keyframe image generation: local placeholder adapter until real image workflow exists
- prompt-only direct video: `wan22_t2v`
- image/reference direct video: `wan22_i2v`
- video reference: `ltx_preview` fallback with future `video_to_video` intent recorded
- premium/high-resolution: upscale workflow selected
- compression/transcoding: web MP4 postprocess intent included

Normalized packet contract is in `apps/api/app/generation_packet.py`.

Packet schema:

- `schema_version`
- `user`
- `route`
- `prompt`
- `creative`
- `assets`
- `context`
- `output`
- `quality_gate`
- `approved_export`

Backward-compatible aliases remain:

- `active_context`
- `subject_lock`
- `continuity_rules`
- `negative_rules`

## 8. Cloudflare / Storage

Production path:

- `presign_put()`
- `presign_get()`
- `public_url_for_key()`
- `getPlaybackUrl()`
- `getDownloadUrl()`
- `getThumbnailUrl()`
- `uploadGeneratedAssetToCloudflare()`
- `uploadVideoToCloudflare()`
- `uploadImageToCloudflare()`

Development fallback:

- enabled only when `RUNPOD_MOCK=true` and not production-like
- uses `var/uploads`
- avoids requiring real R2 for local QA
- does not replace Cloudflare in production

## 9. Upscaling / Compression

Service abstractions are in `apps/api/app/media_pipeline.py`:

- `upscaleVideo()`
- `compressVideo()`
- `transcodeForWeb()`
- `generatePosterFrame()`

Current status:

- postprocess intent is attached to worker metadata
- completed jobs store postprocess metadata
- actual FFmpeg/transcoding execution is still a future worker implementation

## 10. Validation Commands

Passed:

```powershell
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run build
python -m compileall apps/api workers scripts
python scripts/smoke_test.py
python scripts/security_smoke_test.py
python scripts/laptop_seller_qa.py
python scripts/frontend_proxy_smoke.py
```

Preflight result:

```powershell
python scripts/preflight.py
```

Expected local failure:

- production secrets not set
- production API/admin/callback tokens not set
- billing guard not enforced
- RunPod credentials/endpoints not set
- Cloudflare R2 credentials not set
- PostgreSQL not running locally
- ComfyUI workflow JSON files are placeholders

## 11. Issues Found And Fixed During This QA Pass

### Issue 1: API process did not persist under sandboxed start

Symptom:

- API responded once, then disappeared when child process was launched inside sandbox.

Fix/action:

- started API outside sandbox with explicit approval and hidden command shell.

### Issue 2: Local upload failed without R2

Symptom:

- `/api/assets/presign-upload` returned `500`
- error: `R2 is not configured`

Fix:

- added dev-only local mock upload/file endpoints
- verified presign, PUT, and public file fetch through frontend proxy

### Issue 3: Image/video mock jobs failed while preparing input files

Symptom:

- image-to-video and video-reference jobs routed correctly but failed because worker preparation still called `presign_get()`
- error: `R2 is not configured`

Fix:

- in mock mode, task input files now use `asset.public_url` instead of R2 presigned GET
- retested image/video reference jobs; both completed

### Issue 4: `next build` while `next dev` was running broke dev cache

Symptom:

- frontend returned `500`
- error: missing `.next/server` chunk

Fix/action:

- stopped broken dev process
- removed `apps/web/.next`
- restarted `next dev`
- verified `/`, `/admin`, and proxy health return `200`

## 12. Current Known Production Blockers

These cannot be honestly fixed without real external configuration:

- real production auth provider and roles
- real payment provider
- real PostgreSQL service
- real Redis/Celery production queue
- real RunPod API key and endpoint IDs
- real Cloudflare R2 credentials and public/signed URL policy
- real ComfyUI API workflow JSON exports
- actual media postprocess worker execution for compression/upscale/poster frame
- proper audit log persistence
- signed/expiring playback URL strategy for private videos

## 13. Security Notes

Currently good:

- no RunPod key in frontend
- no R2 secret in frontend
- no admin token in frontend
- admin proxy requires separate UI key
- customer coupon creation is not in normal UI
- upload MIME whitelist exists
- server-side upload content-type/size checks exist
- user ownership checks exist for protected operations in security mode

Still required before production:

- disable demo auth
- disable mock payments
- enforce user auth
- enforce billing
- use real admin role enforcement
- add upload MIME sniffing and malware scanning
- use signed/expiring URLs for private media
- add server-side audit logs for admin actions

## 14. Manual QA Credentials And Test Data

Customer QA user:

- user ID: `qa-live-user`
- display name: `QA Live User`
- wallet after signup: `100` credits

Admin QA:

- admin UI key: `manual-admin-key`

Test prompts:

- direct: `Premium 6 second ad for a silver laptop seller in Shenzhen showroom`
- plan: `Premium 10 second ad for a silver laptop seller in Shenzhen showroom`
- image route: `Animate laptop reference into a premium ad`
- video route: `Use this video reference for a premium laptop ad`

## 15. Current Local Status

At report creation time:

- API health: `{"ok":true,"env":"development"}`
- frontend proxy health: `{"ok":true,"env":"development"}`
- `/` returns `200`
- `/admin` returns `200`
- admin usage endpoint works with `manual-admin-key`
- prompt-only direct job completed
- image reference job completed
- video reference job completed
- mock upload works

## 16. Recommended Next Step

The next practical phase is production integration, not more UI refactoring:

1. Add real R2 credentials in environment.
2. Replace workflow placeholders with real ComfyUI API exports.
3. Configure RunPod endpoint IDs.
4. Run the same QA matrix with `RUNPOD_MOCK=false`.
5. Add real auth/payment providers.
6. Enable `USER_AUTH_ENFORCED=true` and `BILLING_ENFORCED=true`.
7. Add actual media postprocess worker implementation for compression/upscale/posters.
