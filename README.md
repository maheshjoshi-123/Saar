# Saar AI Video Production Factory

Saar is a deployable asynchronous AI video generation platform. It connects a Next.js dashboard, FastAPI backend, Redis worker queue, PostgreSQL database, RunPod-hosted ComfyUI workflows, and Cloudflare R2 storage.

The project is original implementation code inspired by the selected open-source architecture patterns:

- `runpod-workers/worker-comfyui` for RunPod ComfyUI workflow execution.
- `samagra14/mediagateway` for provider/model routing ideas.
- `wlsdml1114/Engui_Studio` for RunPod endpoint settings, job library, and media workspace concepts.
- ComfyUI custom-node ecosystems for Wan, LTX, Hunyuan, video helper, frame interpolation, and identity workflows.

## Architecture

```text
apps/web Next.js
  -> apps/api FastAPI
  -> PostgreSQL job database
  -> Redis queue
  -> Celery worker
  -> RunPod Serverless ComfyUI endpoint
  -> Cloudflare R2 output storage
  -> frontend status polling / result playback
```

## Repository Layout

```text
apps/
  api/                 FastAPI app, SQLAlchemy models, RunPod/R2 clients
  web/                 Next.js dashboard
infra/
  docker-compose.yml   Local Postgres + Redis + API + worker + web
workers/
  runpod-comfyui/      Deployable RunPod ComfyUI serverless worker
workflows/
  *.json               ComfyUI API workflow placeholders
render.yaml            Render blueprint for API, worker, and web
```

## Local Quick Start

1. Copy env:

```bash
cp .env.example .env
```

2. Start infrastructure and apps:

```bash
docker compose -f infra/docker-compose.yml up --build
```

3. Open:

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs

## Smoke Test Without Cloud Services

Use this when checking the code path before wiring real Redis, RunPod, or R2 credentials:

```bash
python scripts/smoke_test.py
```

The smoke test sets:

- `QUEUE_MODE=inline`
- `RUNPOD_MOCK=true`
- SQLite test database

It verifies that the API can create a job, route it to a model profile, run the worker path, and return a completed job.

## Deployment Overview

1. Deploy PostgreSQL and Redis on Render, Upstash, or equivalent.
2. Deploy `apps/api` as a Render web service.
3. Deploy `apps/api` worker command as a Render background worker.
4. Deploy `apps/web` to Render Static, Vercel, or Cloudflare Pages.
5. Deploy RunPod ComfyUI endpoints using `workers/runpod-comfyui`, `runpod-workers/worker-comfyui`, or RunPod ComfyUI-to-API.
6. Configure endpoint IDs in environment variables or via `POST /api/admin/model-endpoints`.
7. Configure Cloudflare R2 credentials and public base URL.

## Required Environment Variables

See `.env.example`. The minimum production set is:

- `DATABASE_URL`
- `REDIS_URL`
- `SECRET_KEY`
- `API_AUTH_TOKEN`
- `ADMIN_AUTH_TOKEN`
- `INTERNAL_CALLBACK_TOKEN`
- `RUNPOD_API_KEY`
- at least one `RUNPOD_*_ENDPOINT_ID`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Useful development variables:

- `QUEUE_MODE=inline` runs jobs synchronously inside the API process for local smoke tests.
- `RUNPOD_MOCK=true` replaces real RunPod calls with a deterministic fake completion.
- `WORKFLOW_DIR=workflows` points the API at local ComfyUI workflow JSON files.

## Model Routing

The backend maps job task types to RunPod endpoints:

| Task Type | Default Model | Endpoint Env |
|---|---|---|
| `text_to_video_quality` | Wan 2.2 T2V | `RUNPOD_WAN_T2V_ENDPOINT_ID` |
| `image_to_video` | Wan 2.2 I2V | `RUNPOD_WAN_I2V_ENDPOINT_ID` |
| `fast_preview` | LTX Video | `RUNPOD_LTX_PREVIEW_ENDPOINT_ID` |
| `premium_quality` | HunyuanVideo | `RUNPOD_HUNYUAN_ENDPOINT_ID` |
| `video_upscale` | Upscale workflow | `RUNPOD_UPSCALE_ENDPOINT_ID` |

Database rows in `model_endpoints` override env defaults when present.

## RunPod Worker Contract

The API submits:

```json
{
  "input": {
    "workflow": {},
    "images": [],
    "metadata": {
      "job_id": "uuid",
      "task_type": "image_to_video"
    }
  },
  "webhook": "https://your-api/api/runpod/webhook"
}
```

The worker supports both polling and callback flows. For MVP stability, Saar queues the job and polls RunPod status from the Celery worker.

## Included RunPod Worker

This repo includes `workers/runpod-comfyui`, a deployable serverless worker that starts ComfyUI headlessly, downloads input images from presigned URLs, submits ComfyUI API workflow JSON, waits for WebSocket completion, uploads generated `.mp4` files to Cloudflare R2, and returns `{ "video_url": "..." }`.

Build and push:

```bash
docker build -f workers/runpod-comfyui/Dockerfile -t yourdockerhub/saar-comfyui-worker:latest .
docker push yourdockerhub/saar-comfyui-worker:latest
```

## Production Notes

- Keep GPU concurrency at `1` per endpoint until workflows are proven stable.
- Use RunPod Network Volumes for model files to avoid repeated downloads.
- Use R2 for inputs and outputs; avoid storing media on Render disk.
- Use ComfyUI `Workflow > Export (API)` JSON, then place files in `workflows/`.
- Add real workflows before production. The included workflow JSON files are contract placeholders so the app can be wired and tested, not working Wan/LTX/Hunyuan graphs.

## Production Preflight

Run this before exposing the app:

```bash
python scripts/preflight.py
```

The app is production-ready only when this returns `"ok": true`. It checks secrets, auth tokens, RunPod credentials/endpoints, R2 config, database connection, workflow files, and whether workflow placeholders still need replacement.

See [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) for the full go-live checklist.

## Generation Intelligence

Saar includes a Context Compiler for Video Generation. It converts a messy user idea into a structured generation packet with subject lock, shot grammar, continuity anchors, failure memory, complexity scoring, and model-specific prompt adaptation.

See [docs/GENERATION_INTELLIGENCE.md](docs/GENERATION_INTELLIGENCE.md).
