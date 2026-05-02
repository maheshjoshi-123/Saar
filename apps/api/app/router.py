from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .models import ModelEndpoint, TaskType


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
