import mimetypes
from urllib.parse import quote
import boto3
from botocore.client import Config
from .config import get_settings


def _client():
    settings = get_settings()
    missing = [
        name
        for name, value in {
            "R2_ACCOUNT_ID": settings.r2_account_id,
            "R2_ACCESS_KEY_ID": settings.r2_access_key_id,
            "R2_SECRET_ACCESS_KEY": settings.r2_secret_access_key,
            "R2_BUCKET": settings.r2_bucket,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"R2 is not configured. Missing: {', '.join(missing)}")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region,
        config=Config(signature_version="s3v4"),
    )


def public_url_for_key(key: str) -> str | None:
    base = get_settings().r2_public_base_url.rstrip("/")
    if not base:
        return None
    return f"{base}/{quote(key, safe='/')}"


def key_from_public_url(url: str) -> str | None:
    base = get_settings().r2_public_base_url.rstrip("/")
    if not base or not url.startswith(base + "/"):
        return None
    return url.removeprefix(base + "/")


def presign_put(key: str, content_type: str, expires: int = 900) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": get_settings().r2_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def presign_get(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().r2_bucket, "Key": key},
        ExpiresIn=expires,
    )


def guess_content_type(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def getPlaybackUrl(key: str | None = None, public_url: str | None = None) -> str | None:
    return public_url or (public_url_for_key(key) if key else None)


def getDownloadUrl(key: str | None = None, public_url: str | None = None) -> str | None:
    if public_url:
        return public_url
    if not key:
        return None
    try:
        return presign_get(key)
    except RuntimeError:
        return None


def getThumbnailUrl(key: str | None = None, public_url: str | None = None) -> str | None:
    return public_url or (public_url_for_key(key) if key else None)


def uploadGeneratedAssetToCloudflare(*, key: str, content_type: str) -> dict:
    return {
        "r2_key": key,
        "upload_url": presign_put(key, content_type),
        "public_url": public_url_for_key(key),
        "playback_url": getPlaybackUrl(key=key),
        "download_url": getDownloadUrl(key=key),
    }


def uploadVideoToCloudflare(*, key: str, content_type: str = "video/mp4") -> dict:
    return uploadGeneratedAssetToCloudflare(key=key, content_type=content_type)


def uploadImageToCloudflare(*, key: str, content_type: str = "image/png") -> dict:
    return uploadGeneratedAssetToCloudflare(key=key, content_type=content_type)
