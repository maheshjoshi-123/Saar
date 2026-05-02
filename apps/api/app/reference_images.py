def build_keyframes(scene_plan: list[dict], settings: dict, active_context: dict, memory: dict, existing_keyframes: list[dict] | None = None) -> list[dict]:
    if existing_keyframes:
        return existing_keyframes
    if not scene_plan:
        return []

    duration = int(settings.get("duration_seconds") or 6)
    target_count = 3 if duration <= 6 else 4 if duration <= 10 else 5
    selected = select_keyframe_scenes(scene_plan, target_count)
    keyframes = []
    for index, scene in enumerate(selected):
        timestamp = timestamp_for(index, len(selected), duration)
        description = description_for_keyframe(index, len(selected), scene, settings)
        image_prompt = build_keyframe_prompt(description, scene, settings, active_context)
        image = generate_reference_image(image_prompt, scene.get("negative_prompt") or negative_prompt(memory), settings, f"keyframe-{index + 1}")
        keyframes.append(
            {
                "keyframe_id": f"keyframe-{index + 1}",
                "scene_id": scene.get("id", f"scene-{index + 1}"),
                "timestamp": timestamp,
                "description": description,
                "image_prompt": image_prompt,
                "negative_prompt": scene.get("negative_prompt") or negative_prompt(memory),
                "status": "draft",
                "image_path": image["image_path"],
                "history": [],
            }
        )
    return keyframes


def regenerate_scene_keyframes(scene_plan: list[dict], keyframes: list[dict], scene_id: str, settings: dict, active_context: dict, memory: dict) -> list[dict]:
    scene = next((item for item in scene_plan if item.get("id") == scene_id or str(item.get("scene_number")) == str(scene_id)), None)
    if not scene:
        return keyframes
    regenerated = []
    for keyframe in keyframes:
        if keyframe.get("scene_id") != scene.get("id"):
            regenerated.append(keyframe)
            continue
        if keyframe.get("status") in {"approved", "locked"}:
            regenerated.append(keyframe)
            continue
        description = description_for_keyframe(0, 1, scene, settings)
        prompt = build_keyframe_prompt(description, scene, settings, active_context)
        image = generate_reference_image(prompt, scene.get("negative_prompt") or negative_prompt(memory), settings, keyframe.get("keyframe_id", "keyframe"))
        regenerated.append(
            {
                **keyframe,
                "description": description,
                "image_prompt": prompt,
                "negative_prompt": scene.get("negative_prompt") or negative_prompt(memory),
                "status": "revised",
                "image_path": image["image_path"],
                "history": [*keyframe.get("history", []), snapshot_keyframe(keyframe)],
            }
        )
    return regenerated


def update_keyframe_part(keyframes: list[dict], keyframe_id: str, patch: dict, settings: dict) -> list[dict]:
    updated = []
    for keyframe in keyframes:
        if keyframe.get("keyframe_id") != keyframe_id:
            updated.append(keyframe)
            continue
        if keyframe.get("status") == "locked":
            updated.append(keyframe)
            continue
        next_keyframe = {**keyframe, **{key: value for key, value in patch.items() if value is not None}}
        if "image_prompt" in patch or "description" in patch:
            prompt = next_keyframe.get("image_prompt") or next_keyframe.get("description") or ""
            image = regenerate_reference_image(keyframe_id, prompt, next_keyframe.get("negative_prompt", ""), settings)
            next_keyframe["image_path"] = image["image_path"]
            next_keyframe["status"] = "revised"
            next_keyframe["history"] = [*keyframe.get("history", []), snapshot_keyframe(keyframe)]
        updated.append(next_keyframe)
    return updated


def generate_reference_image(prompt: str, negative_prompt: str, settings: dict, keyframe_id: str) -> dict:
    # TODO: Connect a local image model adapter here when available, such as SDXL, FLUX, RealVisXL, or Juggernaut XL.
    # The API intentionally falls back to prompt-only placeholder mode so plan generation never crashes.
    safe_id = str(keyframe_id).replace("/", "-").replace("\\", "-")
    return {
        "mode": "prompt_only_placeholder",
        "image_path": f"/local-placeholders/reference-{safe_id}.png",
        "prompt": prompt,
        "negative_prompt": negative_prompt,
    }


def regenerate_reference_image(keyframe_id: str, revised_prompt: str, negative_prompt: str, settings: dict) -> dict:
    return generate_reference_image(revised_prompt, negative_prompt, settings, f"{keyframe_id}-revised")


def select_keyframe_scenes(scene_plan: list[dict], target_count: int) -> list[dict]:
    if len(scene_plan) >= target_count:
        return scene_plan[:target_count]
    selected = list(scene_plan)
    while len(selected) < target_count:
        selected.append(scene_plan[-1])
    return selected


def timestamp_for(index: int, total: int, duration: int) -> str:
    if total <= 1:
        return "0s"
    seconds = round((duration / (total - 1)) * index)
    return f"{min(seconds, duration)}s"


def description_for_keyframe(index: int, total: int, scene: dict, settings: dict) -> str:
    if index == 0:
        return f"Opening product/subject frame: {scene.get('visual_description') or scene.get('subject_action')}"
    if index == total - 1:
        return f"Final hero/CTA-ready frame: {scene.get('visual_description') or scene.get('subject_action')}"
    if index == 1:
        return f"Main action frame: {scene.get('subject_action') or scene.get('visual_description')}"
    return f"Emotional lifestyle frame: {scene.get('visual_description') or scene.get('subject_action')}"


def build_keyframe_prompt(description: str, scene: dict, settings: dict, active_context: dict) -> str:
    return (
        f"{settings.get('aspect_ratio', '9:16')} reference keyframe, {settings.get('style', 'Luxury')} "
        f"{settings.get('realism', 'Natural')} commercial image. {description}. "
        f"Scene: {scene.get('title')}. Camera: {scene.get('camera')}. Lighting: {scene.get('lighting')}. "
        f"World: {active_context.get('visual_world')}. Preserve product identity, colour, shape, logo placement, "
        f"material texture, clean mobile-first framing, no extra text."
    )


def negative_prompt(memory: dict) -> str:
    return ", ".join(memory.get("negative_preferences", [])[:10])


def snapshot_keyframe(keyframe: dict) -> dict:
    return {
        "description": keyframe.get("description"),
        "image_prompt": keyframe.get("image_prompt"),
        "negative_prompt": keyframe.get("negative_prompt"),
        "image_path": keyframe.get("image_path"),
        "status": keyframe.get("status"),
    }
