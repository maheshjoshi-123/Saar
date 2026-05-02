from .intelligence_memory import DEFAULT_MEMORY


def fill_settings(raw_prompt: str, settings: dict | None, memory: dict) -> dict:
    settings = dict(settings or {})
    preferences = {**DEFAULT_MEMORY["long_term_preferences"], **memory.get("long_term_preferences", {})}
    lower = raw_prompt.lower()
    return {
        "task": settings.get("task") or settings.get("task_type") or "text_to_video",
        "duration_seconds": int(settings.get("duration_seconds") or settings.get("length") or 6),
        "platform": settings.get("platform") or infer_platform(lower) or preferences["preferred_platform"],
        "style": settings.get("style") or preferences["preferred_style"],
        "pace": settings.get("pace") or preferences["preferred_pace"],
        "realism": settings.get("realism") or preferences["preferred_realism"],
        "audience": settings.get("audience") or preferences["preferred_audience"],
        "hero_subject": settings.get("hero_subject") or settings.get("product") or infer_subject(lower),
        "location": settings.get("location") or infer_location(lower),
        "aspect_ratio": settings.get("aspect_ratio") or "9:16",
    }


def build_active_context(raw_prompt: str, settings: dict, memory: dict) -> dict:
    hero_subject = settings["hero_subject"]
    location = settings["location"]
    platform = settings["platform"]
    return {
        "active_project": infer_project(raw_prompt, hero_subject),
        "hero_subject": hero_subject,
        "platform": platform,
        "audience": settings["audience"],
        "visual_world": f"{location}, aspirational urban lifestyle" if "kathmandu" in location.lower() else location,
        "style": f"{settings['style']}, {settings['realism']} realism, {settings['pace'].lower()} pace",
        "hard_constraints": compact_constraints(
            [
                f"preserve {hero_subject} colour",
                "preserve logo shape and placement",
                *memory.get("negative_preferences", []),
                *[item.get("fix", "") for item in memory.get("failure_memory", []) if isinstance(item, dict)],
            ]
        ),
    }


def infer_platform(prompt: str) -> str | None:
    if "tiktok" in prompt:
        return "TikTok"
    if "instagram" in prompt or "reel" in prompt:
        return "Instagram Reel" if "instagram" in prompt else "Facebook Reel"
    if "youtube" in prompt or "short" in prompt:
        return "YouTube Shorts"
    if "facebook" in prompt:
        return "Facebook Reel"
    return None


def infer_subject(prompt: str) -> str:
    for subject in ["curved-brim cap", "cap", "shoe", "bottle", "watch", "shirt", "bag"]:
        if subject in prompt:
            return subject
    return "main subject"


def infer_location(prompt: str) -> str:
    if "kathmandu" in prompt and "rooftop" in prompt:
        return "Kathmandu rooftop"
    if "kathmandu" in prompt:
        return "Kathmandu urban setting"
    if "rooftop" in prompt:
        return "urban rooftop"
    if "studio" in prompt:
        return "clean studio"
    return "realistic location"


def infer_project(raw_prompt: str, hero_subject: str) -> str:
    lower = raw_prompt.lower()
    if "ad" in lower or "advert" in lower or "reel" in lower:
        return "premium short-form product advert"
    return f"short-form video for {hero_subject}"


def compact_constraints(items: list[str]) -> list[str]:
    out = []
    seen = set()
    for item in items:
        key = str(item).strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(str(item).strip())
    return out[:10]
