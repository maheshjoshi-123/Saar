import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from .config import get_settings


class RunPodClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        if self.settings.runpod_mock:
            return
        if not self.settings.runpod_api_key:
            raise RuntimeError("RUNPOD_API_KEY is not configured")

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.runpod_api_key}", "Content-Type": "application/json"}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def run(self, endpoint_id: str, payload: dict, webhook: str | None = None) -> dict:
        if self.settings.runpod_mock:
            return {"id": f"mock-{payload.get('metadata', {}).get('job_id', 'job')}"}
        body = {"input": payload}
        if webhook:
            body["webhook"] = webhook
        url = f"https://api.runpod.ai/v2/{endpoint_id}/run"
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=self.headers, json=body)
            response.raise_for_status()
            return response.json()

    async def status(self, endpoint_id: str, runpod_job_id: str) -> dict:
        if self.settings.runpod_mock:
            return {
                "id": runpod_job_id,
                "status": "COMPLETED",
                "output": {
                    "video_url": "https://example.com/mock-saar-output.mp4",
                    "mock": True,
                },
            }
        url = f"https://api.runpod.ai/v2/{endpoint_id}/status/{runpod_job_id}"
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
