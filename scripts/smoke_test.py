import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite:///./saar_smoke.db")
os.environ.setdefault("QUEUE_MODE", "inline")
os.environ.setdefault("RUNPOD_MOCK", "true")
os.environ.setdefault("WORKFLOW_DIR", "workflows")
os.environ.setdefault("SECRET_KEY", "smoke-secret")
os.environ.setdefault("INTERNAL_CALLBACK_TOKEN", "smoke-callback")
os.environ.setdefault("API_AUTH_TOKEN", "smoke-api-token")
os.environ.setdefault("ADMIN_AUTH_TOKEN", "smoke-admin-token")

from fastapi.testclient import TestClient  # noqa: E402
from apps.api.app.main import app  # noqa: E402
from apps.api.app.db import engine  # noqa: E402


def main() -> None:
    db_file = Path("saar_smoke.db")
    engine.dispose()
    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200, health.text
        ready = client.get("/ready")
        assert ready.status_code == 200, ready.text

        unauthorized = client.get("/api/jobs")
        assert unauthorized.status_code == 401, unauthorized.text

        headers = {"Authorization": "Bearer smoke-api-token"}

        memory = client.post(
            "/api/memory",
            headers=headers,
            json={
                "type": "failure",
                "priority": 10,
                "content": "Do not allow hands to cover or touch the front logo during motion",
            },
        )
        assert memory.status_code == 200, memory.text

        created = client.post(
            "/api/jobs",
            headers=headers,
            json={
                "prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "task_type": "text_to_video_quality",
                "options": {"poll_seconds": 0, "max_poll_attempts": 1, "subject_lock": {"object": "warm grey curved-brim cap", "logo_rule": "front centre embroidery must remain stable"}},
            },
        )
        assert created.status_code == 200, created.text
        job = created.json()
        assert job["status"] in {"completed", "submitted", "running", "queued"}, job

        fetched = client.get(f"/api/jobs/{job['id']}", headers=headers)
        assert fetched.status_code == 200, fetched.text

        events = client.get(f"/api/jobs/{job['id']}/events", headers=headers)
        assert events.status_code == 200, events.text
        assert len(events.json()) >= 3, events.text

        prompt_version = client.get(f"/api/jobs/{job['id']}/prompt-version", headers=headers)
        assert prompt_version.status_code == 200, prompt_version.text
        packet = prompt_version.json()["generation_packet"]
        assert "subject_lock" in packet, prompt_version.text
        assert "continuity_rules" in packet, prompt_version.text
        assert "Do not allow hands" in " ".join(packet["negative_rules"]), prompt_version.text

        invalid = client.post(
            "/api/jobs",
            headers=headers,
            json={"prompt": "Animate this", "task_type": "image_to_video"},
        )
        assert invalid.status_code == 400, invalid.text
        print({"ok": True, "job": fetched.json()})

    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass


if __name__ == "__main__":
    main()
