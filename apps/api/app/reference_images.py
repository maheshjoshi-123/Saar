import html
from pathlib import Path
from textwrap import wrap
from .config import get_settings


IMAGE_STATUS_PLACEHOLDER = "placeholder"


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
        image = generateKeyframeImage(scene, image_prompt, scene.get("negative_prompt") or negative_prompt(memory), settings)
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
                "image_status": image["status"],
                "image_mode": image["mode"],
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
        image = generateSceneKeyframe(scene, prompt, scene.get("negative_prompt") or negative_prompt(memory), settings)
        regenerated.append(
            {
                **keyframe,
                "description": description,
                "image_prompt": prompt,
                "negative_prompt": scene.get("negative_prompt") or negative_prompt(memory),
                "status": "revised",
                "image_path": image["image_path"],
                "image_status": image["status"],
                "image_mode": image["mode"],
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
            image = regenerateSceneKeyframe(keyframe_id, prompt, next_keyframe.get("negative_prompt", ""), settings)
            next_keyframe["image_path"] = image["image_path"]
            next_keyframe["image_status"] = image["status"]
            next_keyframe["image_mode"] = image["mode"]
            next_keyframe["status"] = "revised"
            next_keyframe["history"] = [*keyframe.get("history", []), snapshot_keyframe(keyframe)]
        updated.append(next_keyframe)
    return updated


def generateKeyframeImage(scene: dict, scene_prompt: str, negative_prompt: str, settings: dict) -> dict:
    """Generate a scene keyframe through the configured local image adapter, with a safe placeholder fallback."""
    # TODO: Add a local image adapter for FLUX.1 schnell, SDXL, or ComfyUI when a local endpoint is configured.
    # The current repo has ComfyUI video workflow templates, but no stable local image-generation API/client.
    return generate_reference_image(scene_prompt, negative_prompt, settings, scene.get("id", scene.get("scene_number", "keyframe")))


def generateSceneKeyframe(scene: dict, packet_or_prompt: dict | str, assets: list | str | None = None, settings: dict | None = None) -> dict:
    prompt = packet_or_prompt if isinstance(packet_or_prompt, str) else str(packet_or_prompt.get("reference_image_prompt") or packet_or_prompt.get("image_prompt") or "")
    negative = assets if isinstance(assets, str) else ""
    return generateKeyframeImage(scene, prompt, negative, settings or {})


def regenerateSceneKeyframe(scene_id: str, revision_prompt: str, negative_prompt: str = "", settings: dict | None = None) -> dict:
    return generate_reference_image(revision_prompt, negative_prompt, settings or {}, f"{scene_id}-revised")


def generate_reference_image(prompt: str, negative_prompt: str, settings: dict, keyframe_id: str) -> dict:
    # Fallback placeholder: clear status, real file path, no heavy local model imports, no production model changes.
    safe_id = str(keyframe_id).replace("/", "-").replace("\\", "-")
    image_path = write_reference_svg(prompt, negative_prompt, settings, safe_id)
    return {
        "mode": "local_placeholder",
        "status": IMAGE_STATUS_PLACEHOLDER,
        "image_path": image_path,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
    }


def regenerate_reference_image(keyframe_id: str, revised_prompt: str, negative_prompt: str, settings: dict) -> dict:
    return regenerateSceneKeyframe(keyframe_id, revised_prompt, negative_prompt, settings)


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
        f"{settings.get('aspect_ratio', '9:16')} photorealistic ad-quality keyframe for video generation. "
        f"{description}. Hero product/subject lock: {settings.get('hero_subject', 'main subject')}; preserve exact colour, "
        f"shape, logo or mark placement, material texture, readable details, and identity from references. "
        f"Scene: {scene.get('title')}. Camera: {scene.get('camera')}. Motion cue: {scene.get('motion')}. "
        f"Lighting: {scene.get('lighting')}. Location/world: {active_context.get('visual_world')}. "
        f"Commercial composition, realistic lens depth, natural skin/material rendering, clean mobile-first frame, no extra text."
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


def write_reference_svg(prompt: str, negative_prompt: str, settings: dict, safe_id: str) -> str:
    target_dir = Path(get_settings().local_reference_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"reference-{safe_id}.svg"
    path = target_dir / filename
    title = f"{settings.get('style', 'Premium')} {settings.get('realism', 'Natural')} keyframe"
    lines = wrap(prompt, width=58)[:8]
    escaped_lines = [html.escape(line) for line in lines]
    escaped_negative = html.escape(negative_prompt[:160])
    text_spans = "\n".join(
        f'<text x="44" y="{190 + index * 30}" fill="#cbd5e1" font-size="20" font-family="Inter, Arial">{line}</text>'
        for index, line in enumerate(escaped_lines)
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="45%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#glow)"/>
  <rect x="32" y="32" width="896" height="476" rx="32" fill="#020617" fill-opacity="0.48" stroke="#ffffff" stroke-opacity="0.14"/>
  <text x="44" y="82" fill="#ffffff" font-size="30" font-weight="700" font-family="Inter, Arial">{html.escape(title)}</text>
  <text x="44" y="122" fill="#a78bfa" font-size="18" font-family="Inter, Arial">Local reference preview - prompt generated by Saar intelligence layer</text>
  <rect x="44" y="146" width="210" height="28" rx="14" fill="#7c3aed" fill-opacity="0.25" stroke="#a78bfa" stroke-opacity="0.35"/>
  <text x="62" y="166" fill="#ddd6fe" font-size="15" font-family="Inter, Arial">not final video render</text>
  {text_spans}
  <text x="44" y="482" fill="#64748b" font-size="15" font-family="Inter, Arial">Avoid: {escaped_negative}</text>
</svg>"""
    path.write_text(svg, encoding="utf-8")
    return f"/local-placeholders/{filename}"
