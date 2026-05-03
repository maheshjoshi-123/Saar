from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .models import Asset, AssetType, ModelEndpoint, TaskType


ENV_DEFAULTS = {
    TaskType.text_to_video_quality: ("wan22_t2v", "Wan 2.2 T2V", "wan22_t2v.json", "runpod_wan_t2v_endpoint_id"),
    TaskType.image_to_video: ("wan22_i2v", "Wan 2.2 I2V", "wan22_i2v.json", "runpod_wan_i2v_endpoint_id"),
    TaskType.fast_preview: ("ltx_preview", "LTX Video Preview", "ltx_preview.json", "runpod_ltx_preview_endpoint_id"),
    TaskType.premium_quality: ("hunyuan_premium", "HunyuanVideo", "hunyuan_premium.json", "runpod_hunyuan_endpoint_id"),
    TaskType.video_upscale: ("video_upscale", "Video Upscale", "upscale.json", "runpod_upscale_endpoint_id"),
}


def _default_endpoint_for_task(task_type: TaskType) -> ModelEndpoint:
    key, model_name, workflow_file, env_attr = ENV_DEFAULTS[task_type]
    endpoint_id = getattr(get_settings(), env_attr)
    if not endpoint_id and get_settings().runpod_mock:
        endpoint_id = "mock-endpoint"
    if not endpoint_id:
        raise RuntimeError(f"No endpoint configured for task {task_type.value}. Set env {env_attr.upper()} or create model endpoint.")

    return ModelEndpoint(
        id=f"default-{key}",
        key=key,
        provider="runpod",
        endpoint_id=endpoint_id,
        model_name=model_name,
        task_type=task_type,
        workflow_file=workflow_file,
        is_active=True,
        priority=999,
        max_concurrency=1,
    )


def resolve_endpoint(db: Session, task_type: TaskType, model_key: str | None = None) -> ModelEndpoint:
    query = select(ModelEndpoint).where(ModelEndpoint.task_type == task_type, ModelEndpoint.is_active.is_(True))
    if model_key:
        query = query.where(ModelEndpoint.key == model_key)
    query = query.order_by(ModelEndpoint.priority.asc())
    row = db.execute(query).scalars().first()
    if row:
        return row

    default = _default_endpoint_for_task(task_type)
    if model_key and model_key != default.key:
        raise RuntimeError(f"Model {model_key} is not active or is not configured for task {task_type.value}")
    return default


def _has_asset_type(assets: list[Asset], asset_type: AssetType) -> bool:
    return any(asset.type == asset_type for asset in assets)


def _option_assets(options: dict) -> list[dict]:
    values = options.get("input_assets") or options.get("reference_summary") or []
    return values if isinstance(values, list) else []


def selectPlanningModel(db: Session, model_key: str | None = None) -> dict:
    """Select the lightweight planning/refinement path.

    Planning is currently handled by Saar's deterministic compiler plus optional Ollama refinement, so it does
    not require a GPU endpoint. Returning a packet keeps the route explicit and swappable later.
    """
    return {
        "stage": "planning",
        "provider": "saar-intelligence",
        "model_key": model_key or "deterministic-planner",
        "workflow_file": None,
        "requires_gpu": False,
    }


def selectImageGenerationModel(db: Session, model_key: str | None = None) -> dict:
    """Select the image/keyframe generation adapter.

    The current repo has local placeholder keyframes and no dedicated image endpoint. This interface is
    intentionally explicit so FLUX/SDXL/ComfyUI image workflows can be registered without changing callers.
    """
    return {
        "stage": "keyframe_image",
        "provider": "local-placeholder",
        "model_key": model_key or "local-keyframe-placeholder",
        "workflow_file": None,
        "requires_gpu": False,
        "status": "placeholder_until_image_workflow_configured",
    }


def selectVideoGenerationModel(
    db: Session,
    *,
    requested_task_type: TaskType,
    input_assets: list[Asset] | None = None,
    options: dict | None = None,
    model_key: str | None = None,
) -> tuple[TaskType, ModelEndpoint, dict]:
    """Choose the concrete video generation task/workflow from prompt and asset context."""
    options = options or {}
    input_assets = input_assets or []
    compact_assets = _option_assets(options)
    has_image = _has_asset_type(input_assets, AssetType.image) or any((item.get("asset_id") or item.get("id")) and (str(item.get("type", "")).startswith("image/") or item.get("kind") == "image") for item in compact_assets if isinstance(item, dict))
    has_video = _has_asset_type(input_assets, AssetType.video) or any(str(item.get("type", "")).startswith("video/") or item.get("kind") == "video" for item in compact_assets if isinstance(item, dict))
    has_keyframes = bool(options.get("approved_keyframes") or options.get("keyframes") or options.get("reference_image_paths"))

    selected_task = requested_task_type
    reason = "user_requested_task"
    future_mode = None
    if requested_task_type == TaskType.text_to_video_quality:
        if has_video:
            # A dedicated video-to-video enum/workflow is not registered yet; route to the safest existing
            # preview/video workflow and keep the future mode explicit for downstream workers.
            selected_task = TaskType.fast_preview
            reason = "video_reference_present_video_to_video_fallback"
            future_mode = "video_to_video"
        elif has_image or has_keyframes:
            if has_image:
                selected_task = TaskType.image_to_video
                reason = "image_reference_present"
            else:
                reason = "keyframe_prompts_present_without_uploaded_image_asset"
    endpoint = resolve_endpoint(db, selected_task, model_key)
    return selected_task, endpoint, {
        "stage": "video_generation",
        "requested_task_type": requested_task_type.value,
        "selected_task_type": selected_task.value,
        "model_key": endpoint.key,
        "provider": endpoint.provider,
        "workflow_file": endpoint.workflow_file,
        "reason": reason,
        "future_mode": future_mode,
    }


def selectUpscaleWorkflow(db: Session, *, quality: str | None = None, options: dict | None = None, model_key: str | None = None) -> dict | None:
    options = options or {}
    should_upscale = bool(options.get("upscale") or options.get("high_resolution") or quality == "premium")
    if not should_upscale:
        return None
    endpoint = resolve_endpoint(db, TaskType.video_upscale, model_key)
    return {
        "stage": "upscale",
        "task_type": TaskType.video_upscale.value,
        "model_key": endpoint.key,
        "provider": endpoint.provider,
        "workflow_file": endpoint.workflow_file,
    }


def selectCompressionWorkflow(*, options: dict | None = None) -> dict:
    options = options or {}
    return {
        "stage": "compression",
        "provider": "worker-ffmpeg",
        "workflow": "web_mp4_h264",
        "enabled": bool(options.get("compress", True)),
        "target_format": options.get("target_format") or "mp4",
        "generate_poster": bool(options.get("generate_poster", True)),
        "max_megabytes": int(options.get("max_output_mb") or 80),
    }


def list_available_endpoints(db: Session) -> list[ModelEndpoint]:
    rows = list(
        db.execute(
            select(ModelEndpoint)
            .where(ModelEndpoint.is_active.is_(True))
            .order_by(ModelEndpoint.task_type.asc(), ModelEndpoint.priority.asc())
        )
        .scalars()
        .all()
    )
    seen = {row.key for row in rows}
    for task_type in ENV_DEFAULTS:
        try:
            default = _default_endpoint_for_task(task_type)
        except RuntimeError:
            continue
        if default.key not in seen:
            rows.append(default)
            seen.add(default.key)
    return rows
