import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.runtime_paths import runtime_db  # noqa: E402

SECURITY_DB = runtime_db("saar_security_smoke.db")
os.environ["DATABASE_URL"] = f"sqlite:///{SECURITY_DB.as_posix()}"
os.environ["QUEUE_MODE"] = "inline"
os.environ["RUNPOD_MOCK"] = "true"
os.environ["WORKFLOW_DIR"] = "workflows"
os.environ["SECRET_KEY"] = "security-secret"
os.environ["INTERNAL_CALLBACK_TOKEN"] = "security-callback"
os.environ["API_AUTH_TOKEN"] = "security-api-token"
os.environ["ADMIN_AUTH_TOKEN"] = "security-admin-token"
os.environ["BILLING_ENFORCED"] = "true"
os.environ["USER_AUTH_ENFORCED"] = "true"
os.environ["USER_AUTH_SECRET"] = "security-user-secret"

from fastapi.testclient import TestClient  # noqa: E402
from apps.api.app.main import app  # noqa: E402
from apps.api.app.db import engine  # noqa: E402
from apps.api.app.db import SessionLocal  # noqa: E402
from apps.api.app.models import Asset, AssetType  # noqa: E402


def main() -> None:
    db_file = SECURITY_DB
    engine.dispose()
    if db_file.exists():
        db_file.unlink()

    api_headers = {"Authorization": "Bearer security-api-token"}
    admin_headers = {"Authorization": "Bearer security-admin-token"}

    with TestClient(app) as client:
        issued = client.post("/api/admin/users/token", headers=admin_headers, json={"user_id": "user-a"})
        assert issued.status_code == 200, issued.text
        user_token = issued.json()["token"]
        assert user_token.startswith("v1."), user_token
        user_headers = {**api_headers, "x-saar-user-id": "user-a", "x-saar-user-token": user_token}

        denied = client.get("/api/billing/wallet?user_id=user-a", headers=api_headers)
        assert denied.status_code == 403, denied.text

        mismatch = client.get("/api/billing/wallet?user_id=user-b", headers=user_headers)
        assert mismatch.status_code == 403, mismatch.text

        grant = client.post("/api/admin/billing/grant", headers=admin_headers, json={"user_id": "user-a", "amount": 200})
        assert grant.status_code == 200, grant.text

        free_abuse = client.post(
            "/api/intelligence/packet",
            headers=user_headers,
            json={"user_id": "user-a", "route": "direct_video", "raw_prompt": "free prompt", "charge_credits": False},
        )
        assert free_abuse.status_code == 403, free_abuse.text

        bad_upload = client.post(
            "/api/assets/presign-upload",
            headers=user_headers,
            json={"user_id": "user-a", "filename": "payload.exe", "content_type": "application/x-msdownload", "file_size": 100, "asset_type": "image"},
        )
        assert bad_upload.status_code == 400, bad_upload.text

        db = SessionLocal()
        try:
            foreign_asset = Asset(user_id="user-b", type=AssetType.image, r2_key="inputs/user-b/source.png", public_url="https://example.com/source.png", mime_type="image/png")
            db.add(foreign_asset)
            db.commit()
            db.refresh(foreign_asset)
            foreign_asset_id = foreign_asset.id
        finally:
            db.close()

        stolen_asset = client.post(
            "/api/jobs",
            headers=user_headers,
            json={"user_id": "user-a", "prompt": "animate this image", "task_type": "image_to_video", "input_asset_id": foreign_asset_id},
        )
        assert stolen_asset.status_code == 403, stolen_asset.text

        created = client.post(
            "/api/jobs",
            headers=user_headers,
            json={"user_id": "user-a", "prompt": "premium cap video", "task_type": "text_to_video_quality", "options": {"poll_seconds": 0, "max_poll_attempts": 1}},
        )
        assert created.status_code == 200, created.text
        job = created.json()
        assert job["debited_credits"] == job["required_credits"], job

        hidden = client.get(f"/api/jobs/{job['id']}?user_id=user-b", headers={**api_headers, "x-saar-user-id": "user-b", "x-saar-user-token": user_token})
        assert hidden.status_code in {401, 403}, hidden.text

        coupon = client.post("/api/admin/coupons", headers=admin_headers, json={"code": "ONCE", "credit_amount": 10, "max_redemptions": 10})
        assert coupon.status_code == 200, coupon.text
        first = client.post("/api/coupons/redeem", headers=user_headers, json={"user_id": "user-a", "code": "ONCE"})
        assert first.status_code == 200, first.text
        second = client.post("/api/coupons/redeem", headers=user_headers, json={"user_id": "user-a", "code": "ONCE"})
        assert second.status_code == 400, second.text

        negative_purchase = client.post("/api/coupons/redeem", headers=user_headers, json={"user_id": "user-a", "code": "ONCE", "purchase_credits": -10})
        assert negative_purchase.status_code == 422, negative_purchase.text

        print({"ok": True, "job_id": job["id"], "required_credits": job["required_credits"]})

    engine.dispose()
    if db_file.exists():
        try:
            db_file.unlink()
        except PermissionError:
            pass


if __name__ == "__main__":
    main()
