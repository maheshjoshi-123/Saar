from .db import SessionLocal, init_db
from .models import ModelEndpoint, TaskType
from .router import ENV_DEFAULTS
from .config import get_settings


def main() -> None:
    init_db()
    settings = get_settings()
    db = SessionLocal()
    try:
        for task, (key, model_name, workflow_file, env_attr) in ENV_DEFAULTS.items():
            endpoint_id = getattr(settings, env_attr)
            if not endpoint_id:
                continue
            existing = db.query(ModelEndpoint).filter(ModelEndpoint.key == key).first()
            if existing:
                continue
            db.add(
                ModelEndpoint(
                    key=key,
                    endpoint_id=endpoint_id,
                    model_name=model_name,
                    task_type=task,
                    workflow_file=workflow_file,
                    is_active=True,
                )
            )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()

