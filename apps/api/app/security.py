import hmac
from hashlib import sha256
from fastapi import Header, HTTPException, status
from .config import get_settings


def _bearer_value(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    token = get_settings().api_auth_token
    if not token:
        return
    if _bearer_value(authorization) != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")


def require_admin_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    token = settings.admin_auth_token or settings.api_auth_token
    if not token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ADMIN_AUTH_TOKEN is required for admin endpoints")
    if _bearer_value(authorization) != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")


def sign_user_token(user_id: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), user_id.encode("utf-8"), sha256).hexdigest()


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
    if x_saar_user_id != requested_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User scope mismatch")
    expected = sign_user_token(requested_user_id, settings.user_auth_secret)
    if not x_saar_user_token or not hmac.compare_digest(x_saar_user_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user token")
    return requested_user_id
