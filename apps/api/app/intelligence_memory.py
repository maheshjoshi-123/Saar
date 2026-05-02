from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from .models import MemoryItem, MemoryType


DEFAULT_MEMORY = {
    "long_term_preferences": {
        "preferred_style": "Luxury",
        "preferred_pace": "Slow",
        "preferred_realism": "Natural",
        "preferred_platform": "Facebook Reel",
        "preferred_audience": "young urban Nepalese consumers",
    },
    "brand_rules": [
        "Use clean, premium, realistic visuals",
        "Avoid cluttered backgrounds",
        "Prefer soft natural lighting",
        "Use Nepal urban context when relevant",
    ],
    "negative_preferences": [
        "Avoid shaky camera",
        "Avoid cartoonish visuals",
        "Avoid over-saturated colours",
        "Avoid distorted logos",
        "Avoid random text appearing in video",
    ],
    "failure_memory": [
        {
            "issue": "Logo distortion during motion",
            "fix": "Keep camera movement slow and avoid hand crossing the logo area",
        }
    ],
    "approved_patterns": [
        "slow dolly-in",
        "muted neutral colour grade",
        "premium product close-up",
    ],
}


def retrieve_structured_memory(db: Session, *, user_id: str | None, project_id: str | None = None) -> dict:
    memory = {
        "user_id": user_id or "anonymous",
        "long_term_preferences": dict(DEFAULT_MEMORY["long_term_preferences"]),
        "brand_rules": list(DEFAULT_MEMORY["brand_rules"]),
        "negative_preferences": list(DEFAULT_MEMORY["negative_preferences"]),
        "failure_memory": list(DEFAULT_MEMORY["failure_memory"]),
        "approved_patterns": list(DEFAULT_MEMORY["approved_patterns"]),
    }

    query = select(MemoryItem).where(MemoryItem.is_active.is_(True))
    scopes = [and_(MemoryItem.user_id.is_(None), MemoryItem.project_id.is_(None))]
    if user_id:
        scopes.append(MemoryItem.user_id == user_id)
    if project_id:
        scopes.append(and_(MemoryItem.project_id == project_id, or_(MemoryItem.user_id == user_id, MemoryItem.user_id.is_(None))))
    rows = db.execute(query.where(or_(*scopes)).order_by(MemoryItem.priority.asc(), MemoryItem.created_at.desc()).limit(100)).scalars().all()

    for row in rows:
        data = row.data if isinstance(row.data, dict) else {}
        if row.type in {MemoryType.brand, MemoryType.critical}:
            append_unique(memory["brand_rules"], row.content)
        elif row.type == MemoryType.failure:
            memory["failure_memory"].append(
                {
                    "issue": data.get("issue") or row.content,
                    "fix": data.get("fix") or data.get("future_rule") or row.content,
                }
            )
            append_unique(memory["negative_preferences"], data.get("future_rule") or row.content)
        elif row.type == MemoryType.style:
            append_unique(memory["approved_patterns"], row.content.replace("Approved pattern:", "").strip())
        elif row.type == MemoryType.optional:
            append_unique(memory["approved_patterns"], row.content)
        elif row.type == MemoryType.subject:
            append_unique(memory["brand_rules"], row.content)

        preferences = data.get("long_term_preferences")
        if isinstance(preferences, dict):
            memory["long_term_preferences"].update({k: v for k, v in preferences.items() if v})

    memory["brand_rules"] = memory["brand_rules"][:12]
    memory["negative_preferences"] = memory["negative_preferences"][:12]
    memory["failure_memory"] = memory["failure_memory"][:8]
    memory["approved_patterns"] = memory["approved_patterns"][:10]
    return memory


def append_unique(items: list, value) -> None:
    if not value:
        return
    key = str(value).strip().lower()
    if key and key not in {str(item).strip().lower() for item in items}:
        items.append(str(value).strip())
