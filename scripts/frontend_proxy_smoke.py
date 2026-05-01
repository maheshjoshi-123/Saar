import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"


def request(url: str, *, method: str = "GET", body: dict | None = None, timeout: int = 10) -> tuple[int, str]:
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def wait_for(url: str, timeout_seconds: int = 30) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            status, _ = request(url, timeout=3)
            if status < 500:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {url}")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> None:
    api_port = free_port()
    web_port = free_port()
    api_url = f"http://127.0.0.1:{api_port}"
    web_url = f"http://127.0.0.1:{web_port}"

    api_env = os.environ.copy()
    api_env.update(
        {
            "DATABASE_URL": "sqlite:///./saar_frontend_proxy_smoke.db",
            "QUEUE_MODE": "inline",
            "RUNPOD_MOCK": "true",
            "WORKFLOW_DIR": "workflows",
            "SECRET_KEY": "frontend-smoke-secret",
            "INTERNAL_CALLBACK_TOKEN": "frontend-smoke-callback",
            "API_AUTH_TOKEN": "frontend-smoke-api-token",
            "ADMIN_AUTH_TOKEN": "frontend-smoke-admin-token",
        }
    )
    web_env = os.environ.copy()
    web_env.update(
        {
            "SAAR_API_URL": api_url,
            "SAAR_API_TOKEN": "frontend-smoke-api-token",
            "SAAR_ADMIN_TOKEN": "frontend-smoke-admin-token",
        }
    )

    db_file = ROOT / "saar_frontend_proxy_smoke.db"
    if db_file.exists():
        db_file.unlink()

    print({"api_url": api_url, "web_url": web_url}, flush=True)
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "apps.api.app.main:app", "--host", "127.0.0.1", "--port", str(api_port)], cwd=ROOT, env=api_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    web = subprocess.Popen(["npm.cmd" if os.name == "nt" else "npm", "run", "dev", "--", "-p", str(web_port)], cwd=WEB, env=web_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for(f"{api_url}/health")
        wait_for(web_url)

        status, body = request(f"{web_url}/api/proxy/health")
        assert status == 200 and '"ok":true' in body, body

        status, body = request(f"{web_url}/api/proxy/api/pricing/plans")
        assert status == 200 and "Starter" in body, body

        status, body = request(
            f"{web_url}/api/proxy/api/jobs/estimate",
            method="POST",
            body={"user_id": "frontend-user", "task_type": "text_to_video_quality", "duration_seconds": 6, "quality": "standard", "complexity_score": 5},
        )
        assert status == 200 and "required_credits" in body, body
        print({"ok": True, "proxy": "healthy"})
    finally:
        for proc in (web, api):
            if proc.poll() is None:
                proc.terminate()
        for proc in (web, api):
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    proc.kill()
        if db_file.exists():
            try:
                db_file.unlink()
            except PermissionError:
                pass


if __name__ == "__main__":
    main()
