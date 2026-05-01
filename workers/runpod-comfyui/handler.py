import json
import mimetypes
import os
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

import boto3
import requests
import runpod
import websocket
from websocket import WebSocketTimeoutException


COMFY = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
CLIENT_ID = str(uuid.uuid4())


def queue_prompt(workflow: dict) -> str:
    response = requests.post(f"{COMFY}/prompt", json={"prompt": workflow, "client_id": CLIENT_ID}, timeout=60)
    response.raise_for_status()
    return response.json()["prompt_id"]


def wait_for_prompt(prompt_id: str, timeout_seconds: int = 3600) -> dict:
    ws_url = f"{COMFY.replace('http://', 'ws://').replace('https://', 'wss://')}/ws?{urlencode({'clientId': CLIENT_ID})}"
    deadline = time.time() + timeout_seconds
    ws = websocket.WebSocket()
    ws.connect(ws_url, timeout=30)
    ws.settimeout(5)
    try:
        while time.time() < deadline:
            try:
                message = ws.recv()
            except WebSocketTimeoutException:
                history = get_history(prompt_id)
                if history:
                    return history
                continue
            if isinstance(message, bytes):
                continue
            data = json.loads(message)
            if data.get("type") == "executing":
                payload = data.get("data", {})
                if payload.get("prompt_id") == prompt_id and payload.get("node") is None:
                    return get_history(prompt_id)
        raise TimeoutError(f"ComfyUI prompt timed out: {prompt_id}")
    finally:
        ws.close()


def get_history(prompt_id: str) -> dict:
    response = requests.get(f"{COMFY}/history/{prompt_id}", timeout=60)
    response.raise_for_status()
    history = response.json().get(prompt_id, {})
    if history.get("status", {}).get("status_str") == "error":
        raise RuntimeError(f"ComfyUI workflow failed: {history.get('status')}")
    return history


def download_input_images(images: list[dict]) -> None:
    input_dir = Path("/app/ComfyUI/input")
    input_dir.mkdir(parents=True, exist_ok=True)
    for image in images:
        url = image.get("url")
        name = Path(str(image.get("name") or "")).name
        if not url or not name:
            continue
        response = requests.get(url, timeout=180)
        response.raise_for_status()
        (input_dir / name).write_bytes(response.content)


def find_output_files(history: dict) -> list[Path]:
    files: list[Path] = []
    output_dir = Path("/app/ComfyUI/output")
    for node in (history.get("outputs") or {}).values():
        for kind in ("videos", "gifs", "images"):
            for item in node.get(kind, []) or []:
                filename = item.get("filename")
                subfolder = item.get("subfolder") or ""
                if filename:
                    candidate = output_dir / subfolder / filename
                    if candidate.exists():
                        files.append(candidate)
    if files:
        return sort_video_first(files)
    fallback = list(output_dir.rglob("*"))
    return sort_video_first([path for path in fallback if path.is_file()])[:1]


def sort_video_first(files: list[Path]) -> list[Path]:
    video_exts = {".mp4", ".webm", ".mov", ".mkv"}
    return sorted(files, key=lambda p: (p.suffix.lower() not in video_exts, -p.stat().st_mtime))


def upload_to_r2(path: Path, job_id: str) -> str | None:
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET")
    public_base = (os.getenv("R2_PUBLIC_BASE_URL") or "").rstrip("/")
    if not all([account_id, access_key, secret_key, bucket, public_base]):
        return None

    key = f"outputs/{job_id}/{path.name}"
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=os.getenv("R2_REGION", "auto"),
    )
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    client.upload_file(str(path), bucket, key, ExtraArgs={"ContentType": content_type})
    return f"{public_base}/{key}"


def handler(event: dict) -> dict:
    job_input = event.get("input") or {}
    workflow = job_input.get("workflow")
    if not isinstance(workflow, dict):
        raise ValueError("input.workflow must be a ComfyUI API workflow object")

    metadata = job_input.get("metadata") or {}
    job_id = metadata.get("job_id") or str(uuid.uuid4())
    download_input_images(job_input.get("images") or [])

    prompt_id = queue_prompt(workflow)
    history = wait_for_prompt(prompt_id, int(job_input.get("timeout_seconds", 3600)))
    files = find_output_files(history)
    if not files:
        raise RuntimeError(f"ComfyUI completed but no output file was found for prompt {prompt_id}")

    video_url = upload_to_r2(files[0], job_id)
    if not video_url:
        raise RuntimeError("R2 upload failed or R2_PUBLIC_BASE_URL/R2 credentials are not configured")
    return {
        "prompt_id": prompt_id,
        "video_url": video_url,
        "files": [str(path) for path in files],
    }


runpod.serverless.start({"handler": handler})
