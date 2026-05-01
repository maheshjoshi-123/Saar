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
