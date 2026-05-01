# Saar RunPod ComfyUI Worker

This worker runs ComfyUI inside a RunPod serverless container and exposes a RunPod handler compatible with the Saar API.

## Build

```bash
docker build -f workers/runpod-comfyui/Dockerfile -t yourdockerhub/saar-comfyui-worker:latest .
docker push yourdockerhub/saar-comfyui-worker:latest
```

## RunPod Environment

Set these variables on the RunPod endpoint:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL
R2_REGION=auto
```

Mount a RunPod Network Volume at `/runpod-volume` and place model files under `/runpod-volume/models`.

## Input Contract

```json
{
  "input": {
    "workflow": {},
    "images": [
      {"name": "source.jpg", "url": "https://presigned-r2-url"}
    ],
    "metadata": {
      "job_id": "saar-job-id",
      "task_type": "image_to_video"
    }
  }
}
```

## Output Contract

```json
{
  "video_url": "https://cdn.example.com/outputs/job/final.mp4",
  "prompt_id": "comfyui-prompt-id"
}
```

