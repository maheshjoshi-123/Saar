import re
from dataclasses import dataclass
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from .models import Asset, MemoryItem, MemoryType, ModelEndpoint, TaskType


PLATFORM_HINTS = {
    "reel": "Facebook Reel",
    "facebook": "Facebook Reel",
    "instagram": "Instagram Reel",
    "tiktok": "TikTok vertical video",
    "youtube": "YouTube Shorts",
}

STYLE_HINTS = {
    "premium": "premium realistic",
    "cinematic": "cinematic realistic",
    "streetwear": "premium streetwear",
    "ad": "advertising",
    "advert": "advertising",
    "campus": "educational promo",
}

NEGATIVE_DEFAULTS = [
    "no shaky camera",
    "no random text",
    "no flicker",
    "no warped hands",
    "no face distortion",
    "no colour shift",
    "no fast cuts",
]


@dataclass
class CompiledPrompt:
    clean_brief: dict
    generation_packet: dict
    final_prompt: str
    negative_prompt: str
    complexity_score: int
    complexity_decision: str


def compile_generation_context(
    db: Session,
    *,
    raw_prompt: str,
    task_type: TaskType,
    endpoint: ModelEndpoint,
    input_asset: Asset | None,
    user_id: str | None,
    project_id: str | None,
    explicit_negative: str | None,
    options: dict,
) -> CompiledPrompt:
    memories = retrieve_memories(db, user_id=user_id, project_id=project_id, raw_prompt=raw_prompt)
    clean_brief = build_clean_brief(raw_prompt, task_type, options)
    subject_lock = build_subject_lock(raw_prompt, input_asset, memories, options)
    visual_world = build_visual_world(raw_prompt, memories, options)
    shot_grammar = build_shot_grammar(raw_prompt, task_type, options)
    continuity_rules = build_continuity_rules(subject_lock, memories, options)
    negative_rules = build_negative_rules(explicit_negative, memories, options)
    complexity = score_complexity(raw_prompt, task_type, shot_grammar, options)
    model_parameters = build_model_parameters(task_type, endpoint, options)

    packet = {
        "intent": clean_brief,
        "subject_lock": subject_lock,
        "visual_world": visual_world,
        "shot_grammar": shot_grammar,
        "continuity_rules": continuity_rules,
        "negative_rules": negative_rules,
        "active_memory": memories,
        "complexity": complexity,
        "model_parameters": model_parameters,
    }
    final_prompt = adapt_packet_to_model(packet, endpoint.key)
    negative_prompt = ", ".join(dedupe(negative_rules))
    return CompiledPrompt(
        clean_brief=clean_brief,
        generation_packet=packet,
        final_prompt=final_prompt,
        negative_prompt=negative_prompt,
        complexity_score=complexity["score"],
        complexity_decision=complexity["decision"],
    )


def retrieve_memories(db: Session, *, user_id: str | None, project_id: str | None, raw_prompt: str) -> dict:
    query = select(MemoryItem).where(MemoryItem.is_active.is_(True))
    scopes = [and_(MemoryItem.user_id.is_(None), MemoryItem.project_id.is_(None))]
    if user_id:
        scopes.append(MemoryItem.user_id == user_id)
    if project_id:
        scopes.append(MemoryItem.project_id == project_id)
    query = query.where(or_(*scopes))
    rows = db.execute(query.order_by(MemoryItem.priority.asc(), MemoryItem.created_at.desc()).limit(50)).scalars().all()
    prompt_words = set(tokenize(raw_prompt))

    buckets = {
        "critical_memory": [],
        "style_memory": [],
        "failure_memory": [],
        "optional_memory": [],
        "subject_memory": [],
    }
    for row in rows:
        text_words = set(tokenize(row.content))
        relevance = 1 if not prompt_words else len(prompt_words & text_words)
        if row.type in {MemoryType.critical, MemoryType.failure, MemoryType.subject} or relevance > 0 or row.priority <= 20:
            target = {
                MemoryType.critical: "critical_memory",
                MemoryType.style: "style_memory",
                MemoryType.brand: "style_memory",
                MemoryType.failure: "failure_memory",
                MemoryType.optional: "optional_memory",
                MemoryType.subject: "subject_memory",
            }[row.type]
            buckets[target].append(row.content)

    return {
        "critical_memory": buckets["critical_memory"][:5],
        "style_memory": buckets["style_memory"][:5],
        "failure_memory": buckets["failure_memory"][:5],
        "subject_memory": buckets["subject_memory"][:5],
        "optional_memory": buckets["optional_memory"][:3],
    }


def build_clean_brief(raw_prompt: str, task_type: TaskType, options: dict) -> dict:
    lower = raw_prompt.lower()
    platform = options.get("platform") or next((value for key, value in PLATFORM_HINTS.items() if key in lower), "short social video")
    style = options.get("style") or " ".join(dedupe([value for key, value in STYLE_HINTS.items() if key in lower])) or "realistic cinematic"
    return {
        "goal": options.get("goal") or raw_prompt.strip(),
        "platform": platform,
        "audience": options.get("audience") or infer_audience(lower),
        "task_type": task_type.value,
        "style": style,
    }


def build_subject_lock(raw_prompt: str, input_asset: Asset | None, memories: dict, options: dict) -> dict:
    explicit = options.get("subject_lock") or {}
    subject = explicit.get("object") or infer_subject(raw_prompt)
    rules = [
        "main subject identity must remain stable",
        "shape must not morph",
        "colour must remain consistent",
    ]
    rules.extend(memories.get("subject_memory", []))
    if input_asset:
        rules.append("preserve visual identity from the input asset")
    return {
        "object": subject,
        "description": explicit.get("description") or subject,
        "colour_rule": explicit.get("colour_rule") or "preserve original colours; avoid unintended colour shifts",
        "material": explicit.get("material") or options.get("material") or "as shown or described",
        "logo_rule": explicit.get("logo_rule") or "logos, marks, and text must not morph if present",
        "shape_constraints": dedupe(explicit.get("shape_constraints", []) + rules),
    }


def build_visual_world(raw_prompt: str, memories: dict, options: dict) -> dict:
    return {
        "location": options.get("location") or infer_location(raw_prompt),
        "style": options.get("style") or first(memories.get("style_memory")) or "premium realistic",
        "lighting": options.get("lighting") or infer_lighting(raw_prompt),
        "colour_grade": options.get("colour_grade") or "muted natural tones",
    }


def build_shot_grammar(raw_prompt: str, task_type: TaskType, options: dict) -> dict:
    lower = raw_prompt.lower()
    return {
        "shot_type": options.get("shot_type") or ("medium close-up" if any(word in lower for word in ["product", "cap", "face"]) else "wide establishing shot"),
        "camera_angle": options.get("camera_angle") or "eye-level",
        "lens": options.get("lens") or "35mm",
        "camera_motion": options.get("camera_motion") or ("locked-off stable camera" if task_type == TaskType.video_upscale else "slow stable dolly-in"),
        "subject_motion": options.get("subject_motion") or infer_subject_motion(raw_prompt),
        "duration": options.get("duration") or "6 seconds",
        "cut_style": options.get("cut_style") or "single continuous shot",
    }


def build_continuity_rules(subject_lock: dict, memories: dict, options: dict) -> list[str]:
    rules = [
        "same subject identity throughout",
        "same object shape throughout",
        "same lighting direction throughout",
        "same background layout throughout",
        "no temporal flicker",
    ]
    if "logo" in subject_lock.get("logo_rule", "").lower():
        rules.append("same logo shape and position throughout")
    rules.extend(options.get("continuity_rules", []))
    rules.extend(memories.get("critical_memory", []))
    return dedupe(rules)


def build_negative_rules(explicit_negative: str | None, memories: dict, options: dict) -> list[str]:
    rules = list(NEGATIVE_DEFAULTS)
    if explicit_negative:
        rules.extend(split_rules(explicit_negative))
    rules.extend(options.get("negative_rules", []))
    rules.extend(memories.get("failure_memory", []))
    return dedupe(rules)


def score_complexity(raw_prompt: str, task_type: TaskType, shot_grammar: dict, options: dict) -> dict:
    lower = raw_prompt.lower()
    components = {
        "people": min(count_any(lower, ["person", "people", "model", "student", "man", "woman", "child"]), 3),
        "product": 1 if any(word in lower for word in ["product", "cap", "shoe", "bottle", "logo", "object"]) else 0,
        "location": 1 if any(word in lower for word in ["street", "rooftop", "campus", "room", "city", "kathmandu"]) else 0,
        "camera_motion": 1 if "stable" not in shot_grammar.get("camera_motion", "") else 0,
        "hand_action": 1 if any(word in lower for word in ["hand", "adjust", "hold", "touch", "wear"]) else 0,
        "text": 1 if any(word in lower for word in ["text", "caption", "logo", "title"]) else 0,
    }
    if task_type == TaskType.premium_quality:
        components["premium_detail"] = 1
    score = int(options.get("complexity_score") or sum(components.values()))
    decision = "safe" if score <= 4 else "acceptable" if score <= 6 else "split_into_smaller_clips"
    return {"score": score, "decision": decision, "components": components}


def build_model_parameters(task_type: TaskType, endpoint: ModelEndpoint, options: dict) -> dict:
    mode = {
        TaskType.text_to_video_quality: "text-to-video",
        TaskType.image_to_video: "image-to-video",
        TaskType.fast_preview: "preview-video",
        TaskType.premium_quality: "premium-video",
        TaskType.video_upscale: "video-upscale",
    }[task_type]
    return {
        "mode": mode,
        "model_key": endpoint.key,
        "aspect_ratio": options.get("aspect_ratio") or "9:16",
        "motion_strength": options.get("motion_strength") or ("low-medium" if task_type == TaskType.image_to_video else "medium"),
        "seed_policy": options.get("seed_policy") or "reuse approved seed where possible",
    }


def adapt_packet_to_model(packet: dict, model_key: str) -> str:
    intent = packet["intent"]
    subject = packet["subject_lock"]
    world = packet["visual_world"]
    shot = packet["shot_grammar"]
    params = packet["model_parameters"]
    continuity = "; ".join(packet["continuity_rules"][:8])
    negative = "; ".join(packet["negative_rules"][:10])

    base = (
        f"{params['aspect_ratio']} {intent['style']} {intent['platform']}. "
        f"{subject['description']} in {world['location']}. "
        f"{shot['shot_type']}, {shot['camera_angle']}, {shot['lens']} lens, {shot['camera_motion']}. "
        f"{shot['subject_motion']}, {shot['duration']}, {shot['cut_style']}. "
        f"Lighting: {world['lighting']}. Colour grade: {world['colour_grade']}. "
        f"Subject lock: {subject['colour_rule']}; {subject['logo_rule']}; {', '.join(subject['shape_constraints'][:4])}. "
        f"Continuity: {continuity}. "
        f"Avoid: {negative}."
    )

    if "ltx" in model_key:
        return compact(base, 900)
    if "hunyuan" in model_key:
        return base + " Preserve cinematic realism, stable motion, and coherent temporal detail."
    if "upscale" in model_key:
        return "Preserve the original video content, identity, colour, camera motion, timing, and composition. Enhance sharpness and reduce artifacts without creative changes."
    return compact(base, 1300)


def infer_subject(prompt: str) -> str:
    lower = prompt.lower()
    for marker in ["cap", "shoe", "bottle", "shirt", "product", "student", "model", "campus"]:
        if marker in lower:
            return marker
    return prompt.strip()[:120]


def infer_location(prompt: str) -> str:
    lower = prompt.lower()
    if "kathmandu" in lower:
        return "Kathmandu"
    if "rooftop" in lower:
        return "rooftop"
    if "campus" in lower or "college" in lower:
        return "modern college campus"
    return "realistic environment"


def infer_lighting(prompt: str) -> str:
    lower = prompt.lower()
    if "golden" in lower:
        return "soft golden-hour side light"
    if "night" in lower:
        return "controlled realistic night lighting"
    return "soft natural light"


def infer_audience(prompt: str) -> str:
    if "nepal" in prompt or "kathmandu" in prompt:
        return "young urban Nepalese consumers"
    if "student" in prompt or "college" in prompt:
        return "students and parents"
    return "social media audience"


def infer_subject_motion(prompt: str) -> str:
    lower = prompt.lower()
    if "adjust" in lower and "cap" in lower:
        return "model adjusts the cap once, keeping hands away from logos or key product details"
    if "walk" in lower:
        return "subject walks naturally with controlled movement"
    if "product" in lower:
        return "minimal product movement, stable and readable"
    return "single clear subject action with controlled motion"


def count_any(text: str, words: list[str]) -> int:
    return sum(1 for word in words if word in text)


def split_rules(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,;\n]+", text) if part.strip()]


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def dedupe(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out


def first(items: list[str]) -> str | None:
    return items[0] if items else None


def compact(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "."
