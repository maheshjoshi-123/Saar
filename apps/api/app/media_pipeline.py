from .r2 import getDownloadUrl, getPlaybackUrl, getThumbnailUrl


def upscaleVideo(video_asset: dict, workflow: dict | None) -> dict:
    return {
        "enabled": bool(workflow),
        "workflow": workflow,
        "input": video_asset,
        "status": "queued_after_generation" if workflow else "skipped",
    }


def compressVideo(video_asset: dict, workflow: dict | None) -> dict:
    workflow = workflow or {}
    return {
        "enabled": bool(workflow.get("enabled", True)),
        "workflow": workflow,
        "input": video_asset,
        "status": "queued_after_generation" if workflow.get("enabled", True) else "skipped",
    }


def transcodeForWeb(video_asset: dict, workflow: dict | None) -> dict:
    return compressVideo(video_asset, workflow)


def generatePosterFrame(video_asset: dict, workflow: dict | None) -> dict:
    workflow = workflow or {}
    return {
        "enabled": bool(workflow.get("generate_poster", True)),
        "input": video_asset,
        "status": "queued_after_generation" if workflow.get("generate_poster", True) else "skipped",
    }


def build_delivery_urls(asset) -> dict:
    if not asset:
        return {"playback_url": None, "download_url": None, "thumbnail_url": None}
    return {
        "playback_url": getPlaybackUrl(key=asset.r2_key, public_url=asset.public_url),
        "download_url": getDownloadUrl(key=asset.r2_key, public_url=asset.public_url),
        "thumbnail_url": getThumbnailUrl(public_url=None),
    }
