from .config import get_settings


def main() -> None:
    settings = get_settings()
    print({"redis_url": settings.redis_url, "workflow_dir": settings.workflow_dir})


if __name__ == "__main__":
    main()

