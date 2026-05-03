from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VAR_DIR = ROOT / "var"
DB_DIR = VAR_DIR / "db"
LOG_DIR = VAR_DIR / "logs"


def ensure_runtime_dirs() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def runtime_db(name: str) -> Path:
    ensure_runtime_dirs()
    return DB_DIR / name
