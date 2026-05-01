#!/usr/bin/env bash
set -euo pipefail

if [ -d "/runpod-volume/models" ]; then
  mkdir -p /app/ComfyUI/models
  ln -sfn /runpod-volume/models/* /app/ComfyUI/models/ || true
fi

cd /app/ComfyUI
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch > /tmp/comfyui.log 2>&1 &

for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

cd /app
python -u handler.py

