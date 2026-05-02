import hmac
import base64
import json
import re
import time
from collections import defaultdict, deque
from hashlib import sha256
from fastapi import Header, HTTPException, Request, status
from .config import get_settings

USER_ID_RE = re.compile(r"^[A-Za-z0-9_.@:-]{1,128}$")
PLACEHOLDER_SECRETS = {"", "change-me", "change-me-too", "dev-secret", "dev-api-token", "dev-admin-token"}
_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def _bearer_value(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def _constant_time_equal(left: str, right: str) -> bool:
    return bool(left) and bool(right) and hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    token = get_settings().api_auth_token
    if not token:
        return
    if not _constant_time_equal(_bearer_value(authorization), token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")


def require_admin_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    token = settings.admin_auth_token
    if not token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ADMIN_AUTH_TOKEN is required for admin endpoints")
    if not _constant_time_equal(_bearer_value(authorization), token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")


def sign_user_token(user_id: str, secret: str) -> str:
    validate_user_id(user_id)
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + max(60, int(get_settings().user_token_ttl_seconds)),
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), sha256).hexdigest()
    return f"v1.{encoded}.{signature}"


def validate_user_id(user_id: str | None) -> None:
    if user_id is None:
        return
    if not USER_ID_RE.fullmatch(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user_id format")


def verify_user_token(user_id: str, token: str, secret: str) -> bool:
    if token.startswith("v1."):
        try:
            _, encoded, signature = token.split(".", 2)
        except ValueError:
            return False
        expected = hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), sha256).hexdigest()
        if not _constant_time_equal(signature, expected):
            return False
        try:
            padded = encoded + "=" * (-len(encoded) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            return False
        return payload.get("sub") == user_id and int(payload.get("exp", 0)) >= int(time.time())

    if get_settings().is_production_like:
        return False
    legacy = hmac.new(secret.encode("utf-8"), user_id.encode("utf-8"), sha256).hexdigest()
    return _constant_time_equal(token, legacy)


def require_user_scope(
    requested_user_id: str | None,
    x_saar_user_id: str | None = None,
    x_saar_user_token: str | None = None,
) -> str | None:
    settings = get_settings()
    if not settings.user_auth_enforced:
        return requested_user_id
    if not settings.user_auth_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="USER_AUTH_SECRET is required when USER_AUTH_ENFORCED=true")
    if not requested_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id is required")
    validate_user_id(requested_user_id)
    if x_saar_user_id != requested_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User scope mismatch")
    if not x_saar_user_token or not verify_user_token(requested_user_id, x_saar_user_token, settings.user_auth_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user token")
    return requested_user_id


def validate_runtime_security() -> None:
    settings = get_settings()
    if not settings.is_production_like:
        return
    problems = []
    if settings.secret_key in PLACEHOLDER_SECRETS or len(settings.secret_key) < 32:
        problems.append("SECRET_KEY must be a non-placeholder value with at least 32 characters")
    if settings.internal_callback_token in PLACEHOLDER_SECRETS or len(settings.internal_callback_token) < 32:
        problems.append("INTERNAL_CALLBACK_TOKEN must be a non-placeholder value with at least 32 characters")
    if not settings.api_auth_token or settings.api_auth_token in PLACEHOLDER_SECRETS or len(settings.api_auth_token) < 32:
        problems.append("API_AUTH_TOKEN must be set to a strong production secret")
    if not settings.admin_auth_token or settings.admin_auth_token in PLACEHOLDER_SECRETS or len(settings.admin_auth_token) < 32:
        problems.append("ADMIN_AUTH_TOKEN must be set to a strong production secret")
    if settings.admin_auth_token and settings.api_auth_token and settings.admin_auth_token == settings.api_auth_token:
        problems.append("ADMIN_AUTH_TOKEN and API_AUTH_TOKEN must be different")
    if not settings.user_auth_enforced:
        problems.append("USER_AUTH_ENFORCED=true is required in production")
    if not settings.billing_enforced:
        problems.append("BILLING_ENFORCED=true is required before taking paid users")
    if settings.demo_auth_enabled:
        problems.append("DEMO_AUTH_ENABLED=false is required in production")
    if settings.mock_payments_enabled:
        problems.append("MOCK_PAYMENTS_ENABLED=false is required in production")
    if problems:
        raise RuntimeError("Production security checks failed: " + "; ".join(problems))


def rate_limit_key(request: Request) -> tuple[str, int]:
    settings = get_settings()
    path = request.url.path
    authorization = _bearer_value(request.headers.get("authorization"))
    user_id = request.headers.get("x-saar-user-id")
    client_host = request.client.host if request.client else "unknown"
    identity = user_id or (sha256(authorization.encode("utf-8")).hexdigest()[:16] if authorization else client_host)
    limit = settings.admin_rate_limit_per_minute if path.startswith("/api/admin") else settings.rate_limit_per_minute
    return f"{identity}:{path}", max(1, limit)


def check_rate_limit(request: Request) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled or request.url.path in {"/", "/health", "/ready"}:
        return
    key, limit = rate_limit_key(request)
    now = time.monotonic()
    bucket = _RATE_BUCKETS[key]
    while bucket and bucket[0] <= now - 60:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests. Please wait before retrying.")
    bucket.append(now)
