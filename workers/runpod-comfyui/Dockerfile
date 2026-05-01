FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV COMFYUI_DIR=/app/ComfyUI

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg curl libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/comfyanonymous/ComfyUI ${COMFYUI_DIR}
RUN cd ${COMFYUI_DIR} && pip install --no-cache-dir -r requirements.txt

RUN cd ${COMFYUI_DIR}/custom_nodes && \
    git clone https://github.com/kijai/ComfyUI-WanVideoWrapper || true && \
    git clone https://github.com/kijai/ComfyUI-HunyuanVideoWrapper || true && \
    git clone https://github.com/Lightricks/ComfyUI-LTXVideo || true && \
    git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite || true && \
    git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation || true && \
    git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus || true && \
    git clone https://github.com/cubiq/ComfyUI_InstantID || true && \
    git clone https://github.com/kijai/ComfyUI-KJNodes || true

RUN find ${COMFYUI_DIR}/custom_nodes -maxdepth 2 -name requirements.txt -print -exec pip install --no-cache-dir -r {} \; || true

COPY workers/runpod-comfyui/requirements.txt /app/worker-requirements.txt
RUN pip install --no-cache-dir -r /app/worker-requirements.txt

COPY workers/runpod-comfyui/handler.py /app/handler.py
COPY workers/runpod-comfyui/start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
