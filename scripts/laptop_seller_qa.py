import json
import os
import sys
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.runtime_paths import runtime_db  # noqa: E402

QA_DB = runtime_db(f"saar_laptop_seller_qa_{uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{QA_DB.as_posix()}"
os.environ.setdefault("QUEUE_MODE", "inline")
os.environ.setdefault("RUNPOD_MOCK", "true")
os.environ.setdefault("WORKFLOW_DIR", "workflows")
os.environ.setdefault("SECRET_KEY", "qa-secret")
os.environ.setdefault("INTERNAL_CALLBACK_TOKEN", "qa-callback-token")
os.environ.setdefault("API_AUTH_TOKEN", "qa-api-token")
os.environ.setdefault("ADMIN_AUTH_TOKEN", "qa-admin-token")
os.environ.setdefault("OLLAMA_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402

from apps.api.app.db import engine  # noqa: E402
from apps.api.app.main import app  # noqa: E402
from apps.api.app.workflows import inspect_workflow_template  # noqa: E402


USER_ID = "china-laptop-seller"
USER_NAME = "China Laptop Seller"
PROMPT = (
    "Create a premium 10-second Facebook Reel for a laptop seller in Shenzhen, China. "
    "Hero product is a thin silver business laptop on a clean electronics showroom desk. "
    "Show reliable build quality, crisp keyboard, bright screen, fast delivery, and wholesale trust."
)
SETTINGS = {
    "platform": "Facebook Reel",
    "duration_seconds": 10,
    "style": "Premium commercial",
    "pace": "Smooth",
    "realism": "Natural",
    "audience": "electronics buyers and wholesale resellers in China",
    "hero_subject": "thin silver business laptop",
    "location": "Shenzhen electronics showroom",
}


def assert_response(response, label: str) -> dict:
    assert response.status_code == 200, f"{label}: {response.status_code} {response.text}"
    return response.json()


def main() -> None:
    db_file = QA_DB
    engine.dispose()
    if db_file.exists():
        db_file.unlink()

    headers = {"Authorization": "Bearer qa-api-token"}
    admin_headers = {"Authorization": "Bearer qa-admin-token"}
    report: dict = {"scenario": "laptop seller in China QA", "checks": []}

    with TestClient(app) as client:
        auth = assert_response(
            client.post("/api/auth/demo", headers=headers, json={"user_id": USER_ID, "name": USER_NAME, "mode": "signup"}),
            "demo signup",
        )
        assert auth["user_id"] == USER_ID
        assert auth["tier"] == "pro"
        report["auth"] = {"user_id": auth["user_id"], "name": auth["name"], "tier": auth["tier"], "token_visible": bool(auth["token"])}

        wallet = assert_response(client.get(f"/api/billing/wallet?user_id={USER_ID}", headers=headers), "wallet")
        assert wallet["balance"] == 100, wallet
        report["wallet_after_signup"] = wallet

        free_coupon = assert_response(
            client.post(
                "/api/admin/coupons",
                headers=admin_headers,
                json={"code": "LAPTOPFREE100", "description": "Full free QA credits", "credit_amount": 100, "percent_bonus": 0},
            ),
            "create free coupon",
        )
        bonus_coupon = assert_response(
            client.post(
                "/api/admin/coupons",
                headers=admin_headers,
                json={"code": "LAPTOPBONUS25", "description": "25 percent purchase bonus", "credit_amount": 0, "percent_bonus": 25},
            ),
            "create bonus coupon",
        )
        mixed_coupon = assert_response(
            client.post(
                "/api/admin/coupons",
                headers=admin_headers,
                json={"code": "LAPTOPMIXED", "description": "Free plus bonus coupon", "credit_amount": 20, "percent_bonus": 10, "max_redemptions": 5},
            ),
            "create mixed coupon",
        )
        assert free_coupon["credit_amount"] == 100
        assert bonus_coupon["percent_bonus"] == 25
        assert mixed_coupon["max_redemptions"] == 5
        report["coupons_created"] = [free_coupon, bonus_coupon, mixed_coupon]

        redeemed_free = assert_response(
            client.post("/api/coupons/redeem", headers=headers, json={"user_id": USER_ID, "code": "LAPTOPFREE100", "purchase_credits": 0}),
            "redeem free coupon",
        )
        assert redeemed_free["balance"] == 200, redeemed_free

        redeemed_bonus = assert_response(
            client.post("/api/coupons/redeem", headers=headers, json={"user_id": USER_ID, "code": "LAPTOPBONUS25", "purchase_credits": 200}),
            "redeem purchase bonus coupon",
        )
        assert redeemed_bonus["balance"] == 250, redeemed_bonus
        report["wallet_after_coupons"] = redeemed_bonus

        direct_packet = assert_response(
            client.post(
                "/api/intelligence/packet",
                headers=headers,
                json={"route": "direct_video", "raw_prompt": PROMPT, "user_id": USER_ID, "settings": SETTINGS},
            ),
            "direct packet",
        )
        assert direct_packet["packet"]["status"] == "ready_for_video_generator"
        assert direct_packet["required_credits"] > 0
        assert direct_packet["debited_credits"] > 0
        assert "laptop" in direct_packet["final_video_prompt"].lower()
        report["direct_packet_summary"] = {
            "required_credits": direct_packet["required_credits"],
            "debited_credits": direct_packet["debited_credits"],
            "quality_gate": direct_packet["quality_gate"],
            "packet_keys": sorted(direct_packet["packet"].keys()),
        }

        plan_packet = assert_response(
            client.post(
                "/api/intelligence/packet",
                headers=headers,
                json={"route": "generate_plan", "raw_prompt": PROMPT, "user_id": USER_ID, "settings": SETTINGS},
            ),
            "plan packet",
        )
        scenes = plan_packet["scene_plan"]
        keyframes = plan_packet["keyframes"]
        assert len(scenes) >= 2
        assert len(keyframes) >= 2
        for scene in scenes:
            assert scene.get("visual_description"), scene
            assert scene.get("camera"), scene
            assert scene.get("motion"), scene
            assert scene.get("lighting"), scene
            assert scene.get("reference_image_prompt"), scene
        for keyframe in keyframes:
            assert keyframe.get("description"), keyframe
            assert keyframe.get("image_prompt"), keyframe
            assert keyframe.get("image_path"), keyframe
        report["plan_packet_summary"] = {
            "required_credits": plan_packet["required_credits"],
            "debited_credits": plan_packet["debited_credits"],
            "scene_count": len(scenes),
            "keyframe_count": len(keyframes),
            "quality_gate": plan_packet["quality_gate"],
        }

        original_first_scene = scenes[0]["visual_description"]
        original_first_keyframe = keyframes[0]["image_prompt"]
        target_scene_id = scenes[1]["id"]
        scene_revision = assert_response(
            client.post(
                "/api/intelligence/packet",
                headers=headers,
                json={
                    "route": "generate_plan",
                    "raw_prompt": PROMPT,
                    "user_id": USER_ID,
                    "settings": SETTINGS,
                    "scene_plan": scenes,
                    "keyframes": keyframes,
                    "edit_scene_id": target_scene_id,
                    "scene_patch": {
                        "visual_description": "Only scene two shows a close-up ports inspection with HDMI, USB-C, and warranty label visible.",
                        "subject_action": "Only scene two shows a close-up ports inspection with HDMI, USB-C, and warranty label visible.",
                        "camera": "Macro push-in across ports, then hold steady.",
                    },
                },
            ),
            "scene-specific revision",
        )
        assert scene_revision["scene_plan"][0]["visual_description"] == original_first_scene
        assert "ports inspection" in scene_revision["scene_plan"][1]["visual_description"]
        assert scene_revision["keyframes"][0]["image_prompt"] == original_first_keyframe

        target_keyframe_id = scene_revision["keyframes"][1]["keyframe_id"]
        keyframe_revision = assert_response(
            client.post(
                "/api/intelligence/packet",
                headers=headers,
                json={
                    "route": "generate_plan",
                    "raw_prompt": PROMPT,
                    "user_id": USER_ID,
                    "settings": SETTINGS,
                    "scene_plan": scene_revision["scene_plan"],
                    "keyframes": scene_revision["keyframes"],
                    "edit_keyframe_id": target_keyframe_id,
                    "keyframe_patch": {"image_prompt": "Revised keyframe: laptop ports are crisp, warranty label readable, no fake brand logos."},
                },
            ),
            "keyframe-specific revision",
        )
        assert keyframe_revision["keyframes"][0]["image_prompt"] == original_first_keyframe
        assert "warranty label readable" in keyframe_revision["keyframes"][1]["image_prompt"]
        assert keyframe_revision["keyframes"][1]["history"]
        report["scene_revision"] = {
            "target_scene_id": target_scene_id,
            "unchanged_scene_1": True,
            "target_scene_changed": keyframe_revision["scene_plan"][1]["visual_description"],
            "unchanged_keyframe_1": True,
        }

        workflow = inspect_workflow_template("wan22_t2v.json")
        assert workflow["exists"]
        assert workflow["valid_json"]
        report["workflow_json"] = workflow

        job = assert_response(
            client.post(
                "/api/jobs",
                headers=headers,
                json={
                    "prompt": keyframe_revision["final_video_prompt"],
                    "task_type": "text_to_video_quality",
                    "user_id": USER_ID,
                    "options": {
                        "source_route": "generate_plan",
                        "duration_seconds": SETTINGS["duration_seconds"],
                        "approved_plan": {"scenes": keyframe_revision["scene_plan"]},
                        "approved_keyframes": keyframe_revision["keyframes"],
                    },
                },
            ),
            "final video job",
        )
        assert job["status"] in {"completed", "submitted", "running", "queued"}
        assert job["required_credits"] and job["required_credits"] > 0
        if job["status"] == "completed":
            assert job["output_url"], job
        report["final_job"] = job

        final_wallet = assert_response(client.get(f"/api/billing/wallet?user_id={USER_ID}", headers=headers), "final wallet")
        ledger = assert_response(client.get(f"/api/billing/ledger?user_id={USER_ID}", headers=headers), "ledger")
        report["final_wallet"] = final_wallet
        report["ledger_summary"] = {
            "entries": len(ledger),
            "credits_granted": sum(row["amount"] for row in ledger if row["amount"] > 0),
            "credits_spent": sum(abs(row["amount"]) for row in ledger if row["amount"] < 0),
            "types": [row["type"] for row in ledger],
        }

    print(json.dumps(report, indent=2, default=str))

    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass


if __name__ == "__main__":
    main()
