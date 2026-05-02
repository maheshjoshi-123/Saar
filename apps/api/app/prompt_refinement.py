from .intelligence_context import build_active_context, fill_settings


def extract_brief(raw_prompt: str, settings: dict) -> dict:
    return {
        "objective": raw_prompt.strip(),
        "platform": settings["platform"],
        "duration": f"{settings['duration_seconds']} seconds",
        "style": settings["style"],
        "pace": settings["pace"],
        "realism": settings["realism"],
        "audience": settings["audience"],
        "hero_subject": settings["hero_subject"],
        "location": settings["location"],
    }


def refine_direct_prompt(raw_prompt: str, settings: dict, active_context: dict, memory: dict) -> str:
    subject = settings["hero_subject"]
    constraints = "; ".join(active_context["hard_constraints"][:6])
    approved = ", ".join(memory.get("approved_patterns", [])[:3])
    return (
        f"{settings['aspect_ratio']} {settings['duration_seconds']}-second {settings['platform']} video. "
        f"Objective: {raw_prompt.strip()} "
        f"Hero subject: {subject}; lock its colour, shape, logo/mark placement, material feel, and readable details throughout. "
        f"Visual style: {settings['style']} {settings['realism']} commercial realism for {settings['audience']}. "
        f"World: {active_context['visual_world']}. "
        f"Camera: {camera_for_pace(settings['pace'])}; 35mm lens; clean product-first framing. "
        f"Lighting: soft natural directional light with muted neutral colour grade. "
        f"Motion: one controlled subject action only; avoid crossing hands over key logo/details. "
        f"Continuity: same subject identity, same lighting direction, same background layout, no flicker. "
        f"Preferred patterns: {approved}. "
        f"Hard constraints: {constraints}."
    )


def create_scene_plan(raw_prompt: str, settings: dict, active_context: dict, memory: dict) -> list[dict]:
    duration = settings["duration_seconds"]
    scene_count = 2 if duration <= 6 else 3 if duration <= 10 else 4
    base = max(2, round(duration / scene_count))
    scenes = []
    for index in range(scene_count):
        scene_number = index + 1
        is_first = index == 0
        is_last = index == scene_count - 1
        title = "Opening hook" if is_first else "Product lock" if is_last else f"Scene {scene_number}"
        visual = (
            f"{settings['hero_subject']} clearly visible in {settings['location']}"
            if is_first
            else f"Controlled supporting action for: {raw_prompt.strip()}"
            if not is_last
            else f"Final stable close-up of {settings['hero_subject']} with preserved shape, colour, and details"
        )
        scene = {
            "scene_number": scene_number,
            "id": f"scene-{scene_number}",
            "title": title,
            "duration": f"{base} sec",
            "visual_description": visual,
            "camera": camera_for_pace(settings["pace"]),
            "motion": "single controlled motion; no fast cuts",
            "lighting": "soft natural directional light",
            "subject_action": visual,
            "continuity_anchors": continuity_anchors(settings, active_context),
            "reference_image_prompt": build_reference_prompt(title, settings, active_context),
            "negative_prompt": negative_prompt(memory),
        }
        scenes.append(scene)
    return scenes


def update_scene_part(scene_plan: list[dict], scene_id: str, patch: dict, settings: dict, active_context: dict, memory: dict) -> list[dict]:
    updated = []
    for scene in scene_plan:
        if scene.get("id") != scene_id and str(scene.get("scene_number")) != str(scene_id):
            updated.append(scene)
            continue
        next_scene = {**scene, **{key: value for key, value in patch.items() if value is not None}}
        if any(key in patch for key in ["title", "visual_description", "subject_action", "camera", "motion", "lighting"]):
            next_scene["reference_image_prompt"] = build_reference_prompt(next_scene.get("title", "Scene"), settings, active_context, next_scene)
            next_scene["negative_prompt"] = negative_prompt(memory)
        updated.append(next_scene)
    return updated


def camera_for_pace(pace: str) -> str:
    if pace.lower() == "fast":
        return "smooth energetic push with stable framing"
    if pace.lower() == "medium":
        return "steady medium-speed dolly with controlled framing"
    return "slow stable dolly-in with no shake"


def continuity_anchors(settings: dict, active_context: dict) -> list[str]:
    return [
        f"same {settings['hero_subject']} colour throughout",
        "same logo shape and placement throughout",
        "same lighting direction throughout",
        "same background layout throughout",
        *active_context.get("hard_constraints", [])[:4],
    ]


def build_reference_prompt(title: str, settings: dict, active_context: dict, scene: dict | None = None) -> str:
    scene_detail = f" {scene.get('visual_description')}" if scene else ""
    return (
        f"{settings['style']} {settings['realism']} reference keyframe for {settings['platform']}: "
        f"{settings['hero_subject']} in {active_context['visual_world']}, {title.lower()}.{scene_detail} "
        f"Clean commercial composition, soft natural light, muted neutral colour grade, product-first framing."
    )


def negative_prompt(memory: dict) -> str:
    return ", ".join(memory.get("negative_preferences", [])[:10])


def build_intelligence_inputs(raw_prompt: str, settings: dict | None, memory: dict) -> tuple[dict, dict, dict]:
    filled = fill_settings(raw_prompt, settings, memory)
    active_context = build_active_context(raw_prompt, filled, memory)
    brief = extract_brief(raw_prompt, filled)
    return filled, active_context, brief
