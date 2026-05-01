# Saar Architecture

## Request Lifecycle

1. User creates a job in the Next.js dashboard.
2. If an input file exists, the dashboard requests `POST /api/assets/presign-upload`.
3. The browser uploads the file directly to Cloudflare R2.
4. The dashboard calls `POST /api/jobs`.
5. FastAPI stores a `jobs` row and dispatches a Celery task.
6. Celery resolves the best `model_endpoints` row or environment default.
7. Celery renders the selected ComfyUI API workflow JSON with job values.
8. Celery submits the workflow to RunPod `/run`.
9. Celery polls RunPod `/status/{job_id}` until terminal state.
10. The final video URL is stored as an `assets` row and linked to the job.
11. The dashboard polls `GET /api/jobs/{id}` and displays the video.

## Production Decisions

- Render handles the CPU backend and queue worker.
- RunPod handles only GPU/ComfyUI workloads.
- Cloudflare R2 stores all media. Render disk is never used for generated videos.
- PostgreSQL is the source of truth for jobs, endpoints, assets, and events.
- Redis is disposable queue infrastructure.

## Real ComfyUI Workflow Setup

1. Build and test workflow in ComfyUI.
2. Use `Workflow > Export (API)`.
3. Place JSON into `workflows/`.
4. Replace prompt, seed, image filename, and video filename fields with string tokens:
   - `"{{prompt}}"`
   - `"{{negative_prompt}}"`
   - `"{{seed}}"`
   - `"{{input_image_name}}"`
   - `"{{input_video_name}}"`
5. Create or update a model endpoint:

```bash
curl -X POST "$API/api/admin/model-endpoints" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "wan22_i2v",
    "endpoint_id": "YOUR_RUNPOD_ENDPOINT",
    "model_name": "Wan 2.2 I2V",
    "task_type": "image_to_video",
    "workflow_file": "wan22_i2v.json",
    "is_active": true,
    "priority": 10
  }'
```

## Local Mock Mode

For code validation before cloud setup:

```bash
QUEUE_MODE=inline RUNPOD_MOCK=true python scripts/smoke_test.py
```

Mock mode does not prove that your Wan/LTX/Hunyuan ComfyUI graphs are valid. It proves that Saar's API, database, model router, worker flow, and response contracts are connected.
