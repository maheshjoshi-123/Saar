from .prompt_refinement import create_scene_plan, refine_direct_prompt, update_scene_part
from .reference_images import build_keyframes, regenerate_scene_keyframes, update_keyframe_part


def build_generation_packet(
    *,
    user_id: str | None,
    route: str,
    raw_prompt: str,
    settings: dict,
    memory: dict,
    active_context: dict,
    brief: dict,
    existing_scene_plan: list[dict] | None = None,
    existing_keyframes: list[dict] | None = None,
    edit_scene_id: str | None = None,
    scene_patch: dict | None = None,
    edit_keyframe_id: str | None = None,
    keyframe_patch: dict | None = None,
) -> dict:
    scene_plan = list(existing_scene_plan or [])
    keyframes = list(existing_keyframes or [])
    if route == "generate_plan":
        if scene_plan and edit_scene_id and scene_patch:
            scene_plan = update_scene_part(scene_plan, edit_scene_id, scene_patch, settings, active_context, memory)
            keyframes = regenerate_scene_keyframes(scene_plan, keyframes, edit_scene_id, settings, active_context, memory) if keyframes else []
        elif not scene_plan:
            scene_plan = create_scene_plan(raw_prompt, settings, active_context, memory)
        if not keyframes:
            keyframes = build_keyframes(scene_plan, settings, active_context, memory)
        if edit_keyframe_id and keyframe_patch:
            keyframes = update_keyframe_part(keyframes, edit_keyframe_id, keyframe_patch, settings)

    refined_prompt = refine_direct_prompt(raw_prompt, settings, active_context, memory)
    reference_images = [
        {
            "scene_id": scene.get("id"),
            "scene_number": scene.get("scene_number"),
            "prompt": scene.get("reference_image_prompt"),
            "path": f"/local-placeholders/{scene.get('id', 'scene')}.png",
            "status": "placeholder",
        }
        for scene in scene_plan
    ]
    final_video_prompt = build_final_video_prompt(refined_prompt, scene_plan, memory)
    final_approval = build_final_approval_packet(scene_plan, keyframes, final_video_prompt, memory, active_context)
    packet = {
        "user_id": user_id or "",
        "route": route,
        "raw_prompt": raw_prompt,
        "refined_prompt": refined_prompt,
        "settings": settings,
        "memory_used": memory,
        "active_context": active_context,
        "brand_rules": memory.get("brand_rules", []),
        "negative_constraints": memory.get("negative_preferences", []),
        "scene_plan": scene_plan,
        "reference_images": reference_images,
        "keyframes": keyframes,
        "reference_image_paths": [item.get("image_path") for item in keyframes if item.get("image_path")],
        "final_video_prompt": final_video_prompt,
        "approved_export": final_approval,
        "brief": brief,
        "quality_gate": quality_gate(settings, memory, active_context, scene_plan, route, keyframes),
        "status": "ready_for_video_generator",
    }
    return packet


def quality_gate(settings: dict, memory: dict, active_context: dict, scene_plan: list[dict], route: str, keyframes: list[dict] | None = None) -> dict:
    keyframes = keyframes or []
    checks = {
        "subject_clear": bool(settings.get("hero_subject") and settings["hero_subject"] != "main subject"),
        "platform_defined": bool(settings.get("platform")),
        "duration_defined": bool(settings.get("duration_seconds")),
        "style_defined": bool(settings.get("style")),
        "motion_not_too_complex": "fast cuts" not in " ".join(active_context.get("hard_constraints", [])).lower(),
        "negative_constraints_included": bool(memory.get("negative_preferences")),
        "continuity_rules_included": bool(active_context.get("hard_constraints")),
        "scene_references_included": route != "generate_plan" or all(scene.get("reference_image_prompt") for scene in scene_plan),
        "keyframes_included": route != "generate_plan" or bool(keyframes),
        "keyframe_prompts_included": route != "generate_plan" or all(item.get("image_prompt") for item in keyframes),
    }
    return {
        "passed": all(checks.values()),
        "checks": checks,
        "recommendations": recommendations_for(checks),
    }


def recommendations_for(checks: dict) -> list[str]:
    labels = {
        "subject_clear": "Clarify the hero subject or product.",
        "platform_defined": "Choose a platform before final generation.",
        "duration_defined": "Choose a duration before final generation.",
        "style_defined": "Choose a visual style before final generation.",
        "motion_not_too_complex": "Reduce motion complexity before final generation.",
        "negative_constraints_included": "Add negative constraints before final generation.",
        "continuity_rules_included": "Add continuity anchors before final generation.",
        "scene_references_included": "Add reference image prompts for every scene.",
        "keyframes_included": "Generate smart keyframes before final video preparation.",
        "keyframe_prompts_included": "Add image prompts for every keyframe.",
    }
    return [labels[key] for key, ok in checks.items() if not ok]


def build_final_video_prompt(refined_prompt: str, scene_plan: list[dict], memory: dict) -> str:
    if not scene_plan:
        return refined_prompt
    scene_lines = []
    for scene in scene_plan:
        scene_lines.append(
            f"Scene {scene.get('scene_number')}: {scene.get('visual_description')} "
            f"Camera: {scene.get('camera')}. Motion: {scene.get('motion')}. Lighting: {scene.get('lighting')}."
        )
    negatives = ", ".join(memory.get("negative_preferences", [])[:8])
    return f"{refined_prompt} Scene plan: {' '.join(scene_lines)} Negative constraints: {negatives}."


def build_final_approval_packet(scene_plan: list[dict], keyframes: list[dict], final_prompt: str, memory: dict, active_context: dict) -> dict:
    approved_keyframes = [item for item in keyframes if item.get("status") in {"approved", "locked"}]
    all_ready = bool(scene_plan) and bool(keyframes) and len(approved_keyframes) == len(keyframes)
    return {
        "approved_plan": {"scenes": scene_plan},
        "approved_keyframes": approved_keyframes,
        "reference_image_paths": [item.get("image_path") for item in approved_keyframes if item.get("image_path")],
        "final_prompt": final_prompt,
        "memory": memory,
        "context": active_context,
        "negative_constraints": memory.get("negative_preferences", []),
        "continuity_rules": active_context.get("hard_constraints", []),
        "ready_for_video_generator": all_ready,
    }
