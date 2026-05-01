from pathlib import Path
from sqlalchemy import text
from .config import Settings, get_settings
from .db import engine
from .router import ENV_DEFAULTS


PLACEHOLDER_MARKER = "_description"


def check_preflight(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    checks: list[dict] = []

    def add(name: str, ok: bool, detail: str) -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    add("secret_key", settings.secret_key not in {"", "change-me"}, "SECRET_KEY must be unique in production")
    add("callback_token", settings.internal_callback_token not in {"", "change-me-too"}, "INTERNAL_CALLBACK_TOKEN must be unique in production")
    add("admin_auth", bool(settings.admin_auth_token or settings.api_auth_token), "Set ADMIN_AUTH_TOKEN or API_AUTH_TOKEN")
    add("runpod_auth", settings.runpod_mock or bool(settings.runpod_api_key), "Set RUNPOD_API_KEY or RUNPOD_MOCK=true")

    endpoint_values = []
    for _, (_, _, _, env_attr) in ENV_DEFAULTS.items():
        value = getattr(settings, env_attr)
        if value:
            endpoint_values.append(value)
    add("runpod_endpoints", settings.runpod_mock or bool(endpoint_values), "Set at least one RUNPOD_*_ENDPOINT_ID or RUNPOD_MOCK=true")

    r2_values = {
        "R2_ACCOUNT_ID": settings.r2_account_id,
        "R2_ACCESS_KEY_ID": settings.r2_access_key_id,
        "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key,
        "R2_BUCKET": settings.r2_bucket,
        "R2_PUBLIC_BASE_URL": settings.r2_public_base_url,
    }
    missing_r2 = [key for key, value in r2_values.items() if not value]
    add("r2_config", not missing_r2, "Missing " + ", ".join(missing_r2) if missing_r2 else "R2 config present")

    workflow_dir = Path(settings.workflow_dir)
    workflow_files = [workflow_dir / data[2] for data in ENV_DEFAULTS.values()]
    missing_workflows = [path.name for path in workflow_files if not path.exists()]
    add("workflow_files", not missing_workflows, "Missing " + ", ".join(missing_workflows) if missing_workflows else "Workflow files present")

    placeholder_files = []
    for path in workflow_files:
        if path.exists() and PLACEHOLDER_MARKER in path.read_text(encoding="utf-8", errors="ignore"):
            placeholder_files.append(path.name)
    add("real_workflows", not placeholder_files, "Replace placeholder workflows: " + ", ".join(placeholder_files) if placeholder_files else "Workflow files do not contain placeholder marker")

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        add("database", True, "Database connection works")
    except Exception as exc:
        add("database", False, str(exc))

    ok = all(item["ok"] for item in checks)
    return {"ok": ok, "checks": checks}


def main() -> None:
    import json
    import sys

    result = check_preflight()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
