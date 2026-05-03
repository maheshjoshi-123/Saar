from .prompt_refinement import create_scene_plan, refine_direct_prompt, update_scene_part
from .reference_images import build_keyframes, regenerate_scene_keyframes, update_keyframe_part


def compact_asset_summary(asset: dict) -> dict:
    return {
        "asset_id": asset.get("asset_id") or asset.get("id"),
        "url": asset.get("public_url") or asset.get("url"),
        "r2_key": asset.get("r2_key"),
        "type": asset.get("type") or asset.get("mime_type"),
        "mime_type": asset.get("mime_type") or asset.get("type"),
        "name": asset.get("name") or asset.get("filename"),
    }


def normalise_generation_packet(
    *,
    base_packet: dict,
    task_type: str,
    route_decision: dict | None = None,
    input_assets: list[dict] | None = None,
    output_settings: dict | None = None,
    upscale_workflow: dict | None = None,
    compression_workflow: dict | None = None,
) -> dict:
    settings = base_packet.get("settings") or {}
    compact_assets = [compact_asset_summary(item) for item in (input_assets or settings.get("attachments") or []) if isinstance(item, dict)]
    reference_images = [item for item in compact_assets if str(item.get("mime_type") or item.get("type") or "").startswith("image/")]
    reference_videos = [item for item in compact_assets if str(item.get("mime_type") or item.get("type") or "").startswith("video/")]
    uploaded_files = [item for item in compact_assets if item not in reference_images and item not in reference_videos]
    normalized = {
        "schema_version": "saar.generation_packet.v1",
        "user": {
            "user_id": base_packet.get("user_id"),
            "project_id": settings.get("project_id") or base_packet.get("project_id"),
        },
        "route": {
            "type": base_packet.get("route"),
            "task_type": task_type,
            "decision": route_decision or {},
        },
        "prompt": {
            "raw": base_packet.get("raw_prompt"),
            "refined": base_packet.get("refined_prompt"),
            "final": base_packet.get("final_video_prompt"),
            "negative": ", ".join(base_packet.get("negative_constraints") or []),
        },
        "creative": {
            "platform": settings.get("platform"),
            "duration_seconds": settings.get("duration_seconds"),
            "style": settings.get("style"),
            "pace": settings.get("pace"),
            "realism": settings.get("realism"),
            "aspect_ratio": settings.get("aspect_ratio", "9:16"),
            "scene_plan": base_packet.get("scene_plan") or [],
            "keyframes": base_packet.get("keyframes") or [],
            "keyframe_prompts": [item.get("image_prompt") for item in base_packet.get("keyframes", []) if item.get("image_prompt")],
        },
        "assets": {
            "reference_images": reference_images,
            "reference_videos": reference_videos,
            "uploaded_files": uploaded_files,
            "reference_image_paths": base_packet.get("reference_image_paths") or [],
            "compact_assets": compact_assets,
        },
        "context": {
            "memory": base_packet.get("memory_used") or {},
            "persona": settings.get("persona") or {},
            "active_context": base_packet.get("active_context") or {},
            "reference_lock": settings.get("reference_lock") or {},
            "brand_rules": base_packet.get("brand_rules") or [],
        },
        "output": {
            **(output_settings or {}),
            "upscale": upscale_workflow,
            "compression": compression_workflow,
        },
        "quality_gate": base_packet.get("quality_gate") or {},
        "approved_export": base_packet.get("approved_export") or {},
    }
    # Backward-compatible aliases for older QA/smoke consumers while new workers use the normalized contract.
    normalized["active_context"] = normalized["context"]["active_context"]
    normalized["subject_lock"] = normalized["context"]["reference_lock"]
    normalized["continuity_rules"] = normalized["context"]["active_context"].get("hard_constraints", [])
    normalized["negative_rules"] = base_packet.get("negative_constraints") or [normalized["prompt"]["negative"] or normalized["prompt"]["final"] or ""]
    return normalized


def buildPlanningPacket(base_packet: dict, route_decision: dict | None = None) -> dict:
    return normalise_generation_packet(base_packet=base_packet, task_type="planning", route_decision=route_decision)


def buildImageGenerationPacket(base_packet: dict, route_decision: dict | None = None) -> dict:
    return normalise_generation_packet(base_packet=base_packet, task_type="keyframe_image", route_decision=route_decision)


def buildVideoGenerationPacket(
    *,
    base_packet: dict,
    task_type: str,
    route_decision: dict,
    input_assets: list[dict] | None = None,
    output_settings: dict | None = None,
    upscale_workflow: dict | None = None,
    compression_workflow: dict | None = None,
) -> dict:
    return normalise_generation_packet(
        base_packet=base_packet,
        task_type=task_type,
        route_decision=route_decision,
        input_assets=input_assets,
        output_settings=output_settings,
        upscale_workflow=upscale_workflow,
        compression_workflow=compression_workflow,
    )


def buildUpscalePacket(base_packet: dict, upscale_workflow: dict, input_assets: list[dict] | None = None) -> dict:
    return normalise_generation_packet(
        base_packet=base_packet,
        task_type="video_upscale",
        route_decision=upscale_workflow,
        input_assets=input_assets,
        upscale_workflow=upscale_workflow,
    )


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

    refined_prompt = refine_direct_prompt(raw_prompt, {**settings, "use_ollama_refine": route == "direct_video"}, active_context, memory)
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
    brand_rules = "; ".join(memory.get("brand_rules", [])[:5])
    
    detailed_prompt = f"""## OVERALL VIDEO DIRECTION & LLM INSTRUCTIONS

**Base Concept:** {refined_prompt}

**Scene Breakdown:**
{chr(10).join(scene_lines)}

**Visual Storytelling Guidelines:**
- Every transition must be smooth and purposeful, maintaining narrative continuity
- Pacing should match the emotional arc of the narrative
- Each scene builds upon the previous one, creating cohesive flow
- Product/subject must remain visually consistent across all scenes

**Cinematography & Camera Work:**
- Focus on deliberate camera movements that enhance the story
- Avoid jarring or unmotivated transitions between shots
- Use depth of field strategically to guide viewer attention
- Maintain spatial consistency across scenes

**Lighting Direction:**
- Establish a consistent lighting language across the entire video
- Use light to create mood and emphasis
- Soft, directional lighting for natural, premium feel
- Avoid harsh shadows unless intentional for dramatic effect

**Color Grading & Tone:**
- Maintain color consistency that aligns with brand identity
- Use complementary colors to create visual interest
- Ensure proper color balance across all scenes
- Preserve product colors exactly as specified

**Animation & Motion:**
- All motion should feel organic and intentional
- Transitions between scenes should flow naturally
- Avoid distracting effects; prioritize storytelling
- Motion should enhance rather than distract from the message

**Asset Continuity:**
- Product/subject appearance must be identical across all scenes
- Logo placement and visibility must be consistent
- Material texture and surface properties must remain stable
- Ensure clean, mobile-first framing throughout

**Negative Constraints (Avoid):** {negatives}

**Brand Rules & Safety:** {brand_rules if brand_rules else 'Follow standard brand safety guidelines'}

**Final Output Requirements:**
- All scenes must work cohesively as a single video
- Final frame should have clear CTA or hero moment
- Video should feel premium, polished, and on-brand
- Ready for social media distribution on specified platforms"""
    
    return detailed_prompt


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
