import json
import re
from pathlib import Path
from .config import get_settings


TOKEN_RE = re.compile(r'"{{([a-zA-Z0-9_]+)}}"')


def load_workflow(filename: str, values: dict) -> dict:
    path = Path(get_settings().workflow_dir) / filename
    if not path.exists():
        raise FileNotFoundError(f"Workflow file not found: {path}")

    raw = path.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = values.get(key)
        return json.dumps(value)

    rendered = TOKEN_RE.sub(replace, raw)
    return json.loads(rendered)

