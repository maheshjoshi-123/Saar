# Saar Deployment Checklist

Use this file before deploying Saar to users.

## 1. Code Validation

Run locally:

```bash
python -m compileall apps/api workers/runpod-comfyui scripts
python scripts/smoke_test.py
python scripts/security_smoke_test.py
cd apps/web && npm run build && npm audit --omit=dev
```

All commands must pass.

## 2. Cloud Requirements

Provision:

- PostgreSQL database
- Redis instance
- Cloudflare R2 bucket
- R2 public/custom domain
- RunPod Serverless endpoint using `workers/runpod-comfyui`
- RunPod Network Volume with model files

## 3. Required Production Secrets

Set:

```text
DATABASE_URL
REDIS_URL
SECRET_KEY
API_AUTH_TOKEN
ADMIN_AUTH_TOKEN
INTERNAL_CALLBACK_TOKEN
RUNPOD_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL
```

Set at least one:

```text
RUNPOD_WAN_T2V_ENDPOINT_ID
RUNPOD_WAN_I2V_ENDPOINT_ID
RUNPOD_LTX_PREVIEW_ENDPOINT_ID
RUNPOD_HUNYUAN_ENDPOINT_ID
RUNPOD_UPSCALE_ENDPOINT_ID
```

For the frontend:

```text
NEXT_PUBLIC_API_URL
SAAR_API_URL
SAAR_API_TOKEN
SAAR_ADMIN_TOKEN
SAAR_ADMIN_UI_KEY
```

For billing:

```text
BILLING_ENFORCED
USER_AUTH_ENFORCED
USER_AUTH_SECRET
```

## 4. Replace Workflow Placeholders

The files in `workflows/` are contract placeholders. Before live GPU deployment:

1. Open ComfyUI.
2. Load the real Wan/LTX/Hunyuan/upscale workflow.
3. Export as API JSON.
4. Replace the matching file in `workflows/`.
5. Keep these replacement tokens where applicable:
   - `"{{prompt}}"`
   - `"{{negative_prompt}}"`
   - `"{{seed}}"`
   - `"{{input_image_name}}"`
   - `"{{input_video_name}}"`

## 5. Production Preflight

Run:

```bash
python scripts/preflight.py
```

Do not expose the app to customers until it returns:

```json
{ "ok": true }
```

## 6. First Live Job

Run the first job with:

- task: `fast_preview`
- short prompt
- low resolution workflow
- worker concurrency: `1`
- RunPod endpoint max workers: `1`

Then verify:

- job moves through `queued`, `running`, `submitted`, `completed`
- output appears in R2
- frontend video player loads the final URL
- `/api/jobs/{id}/events` contains routing, submitted, status, and completed events

## 7. Billing Readiness

Before accepting paid users:

- keep `BILLING_ENFORCED=false` for demos and internal testing
- create or confirm pricing plans in `/api/pricing/plans`
- set different values for `API_AUTH_TOKEN` and `ADMIN_AUTH_TOKEN`
- set `SAAR_ADMIN_UI_KEY` if using the temporary dashboard admin controls
- grant a test wallet enough credits using `/api/admin/billing/grant`
- create and redeem one coupon using `/api/admin/coupons` and `/api/coupons/redeem`
- set `BILLING_ENFORCED=true`
- set `USER_AUTH_ENFORCED=true`
- issue a user token with `/api/admin/users/token` and verify other users cannot fetch that user's wallet/jobs
- confirm an underfunded wallet receives `402 Insufficient credits`
- confirm a failed debited job creates a `refund` ledger row
- connect your real payment provider so successful purchases call the credit grant path
