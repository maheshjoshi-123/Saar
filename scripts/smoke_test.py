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
        admin_headers = {"Authorization": "Bearer smoke-admin-token"}

        plans = client.get("/api/pricing/plans", headers=headers)
        assert plans.status_code == 200, plans.text
        assert len(plans.json()) >= 3, plans.text

        estimate = client.post(
            "/api/jobs/estimate",
            headers=headers,
            json={"user_id": "smoke-user", "task_type": "text_to_video_quality", "duration_seconds": 6, "quality": "standard", "complexity_score": 5},
        )
        assert estimate.status_code == 200, estimate.text
        assert estimate.json()["required_credits"] > 0, estimate.text

        grant = client.post(
            "/api/admin/billing/grant",
            headers=admin_headers,
            json={"user_id": "smoke-user", "amount": 300, "reason": "smoke grant"},
        )
        assert grant.status_code == 200, grant.text
        assert grant.json()["balance"] == 300, grant.text

        coupon = client.post(
            "/api/admin/coupons",
            headers=admin_headers,
            json={"code": "SMOKE50", "credit_amount": 50, "description": "smoke coupon", "max_redemptions": 1},
        )
        assert coupon.status_code == 200, coupon.text

        redeemed = client.post(
            "/api/coupons/redeem",
            headers=headers,
            json={"user_id": "smoke-user", "code": "SMOKE50"},
        )
        assert redeemed.status_code == 200, redeemed.text
        assert redeemed.json()["balance"] == 350, redeemed.text

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

        intake = client.post(
            "/api/assurance/intake",
            headers=headers,
            json={
                "raw_idea": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "style": "Luxury",
                "mood": "Aspirational",
                "platform": "Facebook Reel",
                "audience": "young urban Nepalese consumers",
                "pace": "Slow",
                "realism": "Natural",
                "product": "warm grey curved-brim cap",
                "location": "Kathmandu rooftop",
            },
        )
        assert intake.status_code == 200, intake.text
        plan = intake.json()
        assert plan["confidence"]["expectation_match_score"] >= 80, intake.text

        confirm = client.post(
            f"/api/assurance/{plan['id']}/confirm",
            headers=headers,
            json={"selected_concept_id": "urban-premium"},
        )
        assert confirm.status_code == 200, confirm.text

        created = client.post(
            "/api/jobs",
            headers=headers,
            json={
                "prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "task_type": "text_to_video_quality",
                "user_id": "smoke-user",
                "options": {"poll_seconds": 0, "max_poll_attempts": 1, "assurance_plan_id": plan["id"], "subject_lock": {"object": "warm grey curved-brim cap", "logo_rule": "front centre embroidery must remain stable"}},
            },
        )
        assert created.status_code == 200, created.text
        job = created.json()
        assert job["status"] in {"completed", "submitted", "running", "queued"}, job
        assert job["required_credits"] > 0, job

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

        qa = client.post(f"/api/jobs/{job['id']}/quality-report", headers=headers)
        assert qa.status_code == 200, qa.text
        assert "technical_checks" in qa.json(), qa.text

        revision = client.post(
            "/api/revisions",
            headers=headers,
            json={"job_id": job["id"], "type": "motion", "target": {"seconds": 3}, "instruction": "Make the camera movement slower"},
        )
        assert revision.status_code == 200, revision.text

        feedback = client.post(
            "/api/feedback",
            headers=headers,
            json={"job_id": job["id"], "approved": False, "rating": 3, "approved_patterns": ["muted palette"], "rejected_patterns": ["camera too fast"]},
        )
        assert feedback.status_code == 200, feedback.text

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
