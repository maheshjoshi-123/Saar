import json
import re
from pathlib import Path
from .config import get_settings


TOKEN_RE = re.compile(r'"{{([a-zA-Z0-9_]+)}}"')
RAW_TOKEN_RE = re.compile(r"{{([a-zA-Z0-9_]+)}}")


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


def inspect_workflow_template(filename: str) -> dict:
    path = Path(get_settings().workflow_dir) / filename
    if not path.exists():
        return {"file": filename, "exists": False, "valid_json": False, "tokens": [], "node_count": 0, "issues": ["missing file"]}

    raw = path.read_text(encoding="utf-8", errors="ignore")
    tokens = sorted(set(RAW_TOKEN_RE.findall(raw)))
    issues: list[str] = []
    valid_json = False
    node_count = 0
    try:
        parsed = json.loads(raw)
        valid_json = isinstance(parsed, dict)
        if valid_json:
            node_count = len([value for value in parsed.values() if isinstance(value, dict)])
            if node_count == 0:
                issues.append("workflow has no ComfyUI API nodes")
            if "_description" in parsed:
                issues.append("placeholder workflow must be replaced before production")
    except json.JSONDecodeError as exc:
        issues.append(f"invalid JSON: {exc.msg}")

    return {
        "file": filename,
        "exists": True,
        "valid_json": valid_json,
        "tokens": tokens,
        "node_count": node_count,
        "issues": issues,
    }
