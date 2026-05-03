import os
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.runtime_paths import runtime_db  # noqa: E402

SMOKE_DB = runtime_db(f"saar_smoke_{uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{SMOKE_DB.as_posix()}"
os.environ.setdefault("QUEUE_MODE", "inline")
os.environ.setdefault("RUNPOD_MOCK", "true")
os.environ.setdefault("WORKFLOW_DIR", "workflows")
os.environ.setdefault("SECRET_KEY", "smoke-secret")
os.environ.setdefault("INTERNAL_CALLBACK_TOKEN", "smoke-callback")
os.environ.setdefault("API_AUTH_TOKEN", "smoke-api-token")
os.environ.setdefault("ADMIN_AUTH_TOKEN", "smoke-admin-token")
os.environ.setdefault("OLLAMA_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402
from apps.api.app.main import app  # noqa: E402
from apps.api.app.db import engine  # noqa: E402
from apps.api.app.tasks import extract_output_url  # noqa: E402
from apps.api.app.workflows import inspect_workflow_template  # noqa: E402


def main() -> None:
    db_file = SMOKE_DB
    engine.dispose()
    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200, health.text
        root = client.get("/")
        assert root.status_code == 200, root.text
        assert root.json()["docs"] == "/docs", root.text
        ready = client.get("/ready")
        assert ready.status_code == 200, ready.text

        unauthorized = client.get("/api/jobs")
        assert unauthorized.status_code == 401, unauthorized.text

        headers = {"Authorization": "Bearer smoke-api-token"}
        admin_headers = {"Authorization": "Bearer smoke-admin-token"}

        plans = client.get("/api/pricing/plans", headers=headers)
        assert plans.status_code == 200, plans.text
        assert len(plans.json()) >= 3, plans.text

        models = client.get("/api/models", headers=headers)
        assert models.status_code == 200, models.text
        assert any(item["key"] == "wan22_t2v" for item in models.json()), models.text

        workflow_inspection = inspect_workflow_template("wan22_t2v.json")
        assert workflow_inspection["exists"], workflow_inspection
        assert workflow_inspection["valid_json"], workflow_inspection
        assert workflow_inspection["node_count"] >= 1, workflow_inspection

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

        subscription = client.post(
            "/api/admin/billing/subscribe",
            headers=admin_headers,
            json={"user_id": "smoke-user", "plan_key": "starter", "cycles": 1, "payment_reference": "smoke"},
        )
        assert subscription.status_code == 200, subscription.text
        assert subscription.json()["balance"] == 420, subscription.text

        user_subscription = client.post(
            "/api/billing/subscribe",
            headers=headers,
            json={"user_id": "smoke-user", "plan_key": "creator", "cycles": 1, "payment_reference": "smoke-ui"},
        )
        assert user_subscription.status_code == 200, user_subscription.text
        assert user_subscription.json()["balance"] == 870, user_subscription.text

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
        assert redeemed.json()["balance"] == 920, redeemed.text

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

        direct_packet = client.post(
            "/api/intelligence/packet",
            headers=headers,
            json={
                "route": "direct_video",
                "raw_prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "user_id": "smoke-user",
                "settings": {
                    "platform": "Facebook Reel",
                    "duration_seconds": 6,
                    "style": "Luxury",
                    "pace": "Slow",
                    "realism": "Natural",
                    "audience": "young urban Nepalese consumers",
                    "hero_subject": "warm grey curved-brim cap",
                    "location": "Kathmandu rooftop",
                },
            },
        )
        assert direct_packet.status_code == 200, direct_packet.text
        direct_body = direct_packet.json()
        assert direct_body["packet"]["status"] == "ready_for_video_generator", direct_packet.text
        assert direct_body["packet"]["raw_prompt"] != direct_body["packet"]["final_video_prompt"], direct_packet.text
        assert direct_body["quality_gate"]["checks"]["negative_constraints_included"], direct_packet.text
        assert "brand_rules" in direct_body["packet"], direct_packet.text

        plan_packet = client.post(
            "/api/intelligence/packet",
            headers=headers,
            json={
                "route": "generate_plan",
                "raw_prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "user_id": "smoke-user",
                "settings": {
                    "platform": "Facebook Reel",
                    "duration_seconds": 6,
                    "style": "Luxury",
                    "pace": "Slow",
                    "realism": "Natural",
                    "audience": "young urban Nepalese consumers",
                    "hero_subject": "warm grey curved-brim cap",
                    "location": "Kathmandu rooftop",
                },
            },
        )
        assert plan_packet.status_code == 200, plan_packet.text
        plan_body = plan_packet.json()
        assert len(plan_body["scene_plan"]) == 3, plan_packet.text
        assert len(plan_body["reference_images"]) == 3, plan_packet.text
        assert len(plan_body["keyframes"]) >= 3, plan_packet.text
        assert all(item["image_prompt"] for item in plan_body["keyframes"]), plan_packet.text
        assert all(item["image_path"] for item in plan_body["keyframes"]), plan_packet.text
        assert plan_body["quality_gate"]["checks"]["scene_references_included"], plan_packet.text
        assert plan_body["quality_gate"]["checks"]["keyframes_included"], plan_packet.text

        original_first_scene = plan_body["scene_plan"][0]["visual_description"]
        original_first_keyframe = plan_body["keyframes"][0]["image_prompt"]
        edited_plan = client.post(
            "/api/intelligence/packet",
            headers=headers,
            json={
                "route": "generate_plan",
                "raw_prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "user_id": "smoke-user",
                "settings": {
                    "platform": "Facebook Reel",
                    "duration_seconds": 6,
                    "style": "Luxury",
                    "pace": "Slow",
                    "realism": "Natural",
                    "audience": "young urban Nepalese consumers",
                    "hero_subject": "warm grey curved-brim cap",
                    "location": "Kathmandu rooftop",
                },
                "scene_plan": plan_body["scene_plan"],
                "keyframes": plan_body["keyframes"],
                "edit_scene_id": "scene-2",
                "scene_patch": {
                    "visual_description": "Hold the cap in a cleaner skyline frame with the front embroidery fully visible",
                    "subject_action": "Hold the cap in a cleaner skyline frame with the front embroidery fully visible",
                },
            },
        )
        assert edited_plan.status_code == 200, edited_plan.text
        edited_body = edited_plan.json()
        assert edited_body["scene_plan"][0]["visual_description"] == original_first_scene, edited_plan.text
        assert "cleaner skyline" in edited_body["scene_plan"][1]["visual_description"], edited_plan.text
        assert "cleaner skyline" in edited_body["scene_plan"][1]["reference_image_prompt"], edited_plan.text
        assert edited_body["keyframes"][0]["image_prompt"] == original_first_keyframe, edited_plan.text

        revised_keyframe = client.post(
            "/api/intelligence/packet",
            headers=headers,
            json={
                "route": "generate_plan",
                "raw_prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop, model adjusts the cap once",
                "user_id": "smoke-user",
                "settings": {
                    "platform": "Facebook Reel",
                    "duration_seconds": 6,
                    "style": "Luxury",
                    "pace": "Slow",
                    "realism": "Natural",
                    "audience": "young urban Nepalese consumers",
                    "hero_subject": "warm grey curved-brim cap",
                    "location": "Kathmandu rooftop",
                },
                "scene_plan": edited_body["scene_plan"],
                "keyframes": edited_body["keyframes"],
                "edit_keyframe_id": edited_body["keyframes"][1]["keyframe_id"],
                "keyframe_patch": {"image_prompt": "Revised keyframe showing the cap logo crisp and unobstructed"},
            },
        )
        assert revised_keyframe.status_code == 200, revised_keyframe.text
        revised_body = revised_keyframe.json()
        assert revised_body["keyframes"][0]["image_prompt"] == original_first_keyframe, revised_keyframe.text
        assert "crisp and unobstructed" in revised_body["keyframes"][1]["image_prompt"], revised_keyframe.text
        assert revised_body["keyframes"][1]["history"], revised_keyframe.text

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
        assert "active_context" in packet, prompt_version.text
        assert "subject_lock" in packet, prompt_version.text
        assert "continuity_rules" in packet, prompt_version.text
        assert "Do not allow hands" in " ".join(packet["negative_rules"]), prompt_version.text

        preview = client.post(
            "/api/context/preview",
            headers=headers,
            json={
                "prompt": "A premium Facebook Reel for a grey curved-brim cap on a Kathmandu rooftop",
                "task_type": "text_to_video_quality",
                "user_id": "smoke-user",
                "duration_seconds": 8,
                "quality": "premium",
                "options": {"product": "warm grey curved-brim cap", "location": "Kathmandu rooftop"},
            },
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["required_credits"] > job["required_credits"], preview.text
        assert "active_context" in preview.json()["generation_packet"], preview.text

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

        usage = client.get("/api/admin/usage/summary", headers=admin_headers)
        assert usage.status_code == 200, usage.text
        assert usage.json()["total_jobs"] >= 1, usage.text
        assert usage.json()["jobs_by_model"].get("wan22_t2v", 0) >= 1, usage.text

        admin_users = client.get("/api/admin/users", headers=admin_headers)
        assert admin_users.status_code == 200, admin_users.text
        assert any(row["user_id"] == "smoke-user" for row in admin_users.json()), admin_users.text

        admin_jobs = client.get("/api/admin/jobs", headers=admin_headers)
        assert admin_jobs.status_code == 200, admin_jobs.text
        assert any(row["id"] == job["id"] for row in admin_jobs.json()), admin_jobs.text

        admin_assets = client.get("/api/admin/assets", headers=admin_headers)
        assert admin_assets.status_code == 200, admin_assets.text

        disabled_coupon = client.post(f"/api/admin/coupons/{coupon.json()['id']}/disable", headers=admin_headers)
        assert disabled_coupon.status_code == 200, disabled_coupon.text
        assert disabled_coupon.json()["is_active"] is False, disabled_coupon.text

        assert extract_output_url({"images": [{"filename": "x.png", "type": "s3_url", "data": "https://cdn.example.com/x.png"}]}) == "https://cdn.example.com/x.png"
        assert extract_output_url({"videos": [{"filename": "x.mp4", "type": "s3_url", "data": "https://cdn.example.com/x.mp4"}]}) == "https://cdn.example.com/x.mp4"

        invalid = client.post(
            "/api/jobs",
            headers=headers,
            json={"prompt": "Animate this", "task_type": "image_to_video"},
        )
        assert invalid.status_code == 400, invalid.text

        invalid_model = client.post(
            "/api/jobs",
            headers=headers,
            json={"prompt": "Use a missing model", "task_type": "text_to_video_quality", "model_key": "missing-model", "user_id": "smoke-user"},
        )
        assert invalid_model.status_code == 400, invalid_model.text
        assert "Model routing failed" in invalid_model.text, invalid_model.text
        print({"ok": True, "job": fetched.json()})

    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass


if __name__ == "__main__":
    main()
