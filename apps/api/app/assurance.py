from datetime import datetime
from sqlalchemy.orm import Session
from .models import AssurancePlan, AssuranceStatus, Job, MemoryItem, MemoryType, QualityReport, RevisionRequest
from .schemas import DesireIntakeRequest, FeedbackIn


def create_assurance_plan(db: Session, body: DesireIntakeRequest) -> AssurancePlan:
    intake = {
        "style": body.style or infer_choice(body.raw_idea, {"premium": "Luxury", "street": "Streetwear", "corporate": "Corporate", "minimal": "Minimal"}, "Premium"),
        "mood": body.mood or infer_choice(body.raw_idea, {"bold": "Bold", "calm": "Calm", "aspir": "Aspirational", "energy": "Energetic"}, "Aspirational"),
        "audience": body.audience or ("young urban Nepalese consumers" if contains(body.raw_idea, ["nepal", "kathmandu"]) else "social media audience"),
        "platform": body.platform or infer_choice(body.raw_idea, {"reel": "Facebook Reel", "tiktok": "TikTok", "youtube": "YouTube Shorts"}, "Facebook Reel"),
        "pace": body.pace or infer_choice(body.raw_idea, {"fast": "Fast", "slow": "Slow"}, "Medium"),
        "realism": body.realism or infer_choice(body.raw_idea, {"styl": "Stylised", "hyper": "Hyper-real"}, "Natural"),
        "product": body.product or infer_product(body.raw_idea),
        "location": body.location or infer_location(body.raw_idea),
        "duration_seconds": body.duration_seconds or 6,
    }
    summary = {
        "you_want": [
            f"{intake['duration_seconds']}-second {intake['platform']} video",
            f"{intake['style']} style with {intake['mood'].lower()} mood",
            f"Audience: {intake['audience']}",
            f"Hero subject: {intake['product']}",
            f"Location: {intake['location']}",
            f"Pace: {intake['pace']}, realism: {intake['realism']}",
        ],
        "must_confirm": [
            "product/subject accuracy",
            "colour and logo preservation",
            "camera pace",
            "background and lighting",
        ],
    }
    concepts = build_concepts(intake)
    confidence = estimate_confidence(intake, body.raw_idea)
    plan = AssurancePlan(
        user_id=body.user_id,
        project_id=body.project_id,
        raw_idea=body.raw_idea,
        structured_intake=intake,
        expectation_summary=summary,
        concept_options=concepts,
        confidence=confidence,
        status=AssuranceStatus.awaiting_confirmation,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def confirm_assurance_plan(db: Session, plan: AssurancePlan, selected_concept_id: str | None, edits: dict) -> AssurancePlan:
    if edits:
        plan.structured_intake = {**plan.structured_intake, **edits}
        plan.expectation_summary = {
            **plan.expectation_summary,
            "edits_applied": edits,
        }
    plan.selected_concept_id = selected_concept_id or plan.selected_concept_id or (plan.concept_options[0]["id"] if plan.concept_options else None)
    plan.status = AssuranceStatus.confirmed
    plan.confirmed_at = datetime.utcnow()
    db.commit()
    db.refresh(plan)
    return plan


def build_options_from_assurance(plan: AssurancePlan, existing_options: dict | None = None) -> dict:
    options = dict(existing_options or {})
    intake = plan.structured_intake
    concept = next((item for item in plan.concept_options if item["id"] == plan.selected_concept_id), None) or (plan.concept_options[0] if plan.concept_options else {})
    options.update(
        {
            "assurance_plan_id": plan.id,
            "goal": plan.raw_idea,
            "platform": intake.get("platform"),
            "audience": intake.get("audience"),
            "style": concept.get("style") or intake.get("style"),
            "location": concept.get("location") or intake.get("location"),
            "lighting": concept.get("lighting"),
            "camera_motion": concept.get("camera_motion"),
            "duration": f"{intake.get('duration_seconds', 6)} seconds",
            "subject_lock": {
                "object": intake.get("product"),
                "description": intake.get("product"),
                "logo_rule": "logos, embroidery, and product marks must remain stable and readable",
                "shape_constraints": ["product silhouette must not morph", "hero product remains visible"],
            },
        }
    )
    return options


def create_quality_report(db: Session, job: Job) -> QualityReport:
    prompt = job.prompt.lower()
    options = job.options if isinstance(job.options, dict) else {}
    technical = {
        "has_output": bool(job.output_asset_id),
        "completed": job.status.value == "completed",
        "complexity_safe": options.get("complexity_decision") in {"safe", "acceptable"},
        "has_negative_rules": bool(job.negative_prompt),
        "has_model": bool(job.model_key),
    }
    commercial = {
        "product_visible_instruction": any(word in prompt for word in ["product", "cap", "logo", "advert", "ad"]),
        "mobile_platform_instruction": any(word in prompt for word in ["reel", "tiktok", "short", "vertical", "facebook"]),
        "strong_style_instruction": any(word in prompt for word in ["premium", "cinematic", "streetwear", "luxury", "modern"]),
        "audience_instruction": "audience" in str(options).lower() or "nepal" in prompt or "student" in prompt,
    }
    passed = all(technical.values()) and sum(1 for ok in commercial.values() if ok) >= 3
    recommendations = []
    if not technical["complexity_safe"]:
        recommendations.append("Split this idea into smaller clips before final rendering")
    if not commercial["mobile_platform_instruction"]:
        recommendations.append("Add platform/framing instruction before final delivery")
    if not commercial["product_visible_instruction"]:
        recommendations.append("Strengthen hero subject visibility in the prompt")
    report = QualityReport(job_id=job.id, technical_checks=technical, commercial_checks=commercial, passed=passed, recommendations=recommendations)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def create_revision_request(db: Session, *, job_id: str, user_id: str | None, type: str, target: dict, instruction: str) -> RevisionRequest:
    revision = RevisionRequest(job_id=job_id, user_id=user_id, type=type, target=target, instruction=instruction)
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


def store_feedback_memory(db: Session, feedback: FeedbackIn) -> list[MemoryItem]:
    created = []
    for pattern in feedback.approved_patterns:
        item = MemoryItem(user_id=feedback.user_id, type=MemoryType.style, priority=30, content=f"Approved pattern: {pattern}", data={"job_id": feedback.job_id, "rating": feedback.rating})
        db.add(item)
        created.append(item)
    for pattern in feedback.rejected_patterns:
        item = MemoryItem(user_id=feedback.user_id, type=MemoryType.failure, priority=10, content=f"Avoid rejected pattern: {pattern}", data={"job_id": feedback.job_id, "rating": feedback.rating, "notes": feedback.notes})
        db.add(item)
        created.append(item)
    db.commit()
    return created


def build_concepts(intake: dict) -> list[dict]:
    product = intake["product"]
    return [
        {
            "id": "urban-premium",
            "name": "Urban Premium",
            "style": f"{intake['style']} realistic",
            "location": intake["location"],
            "lighting": "soft golden-hour side light",
            "camera_motion": "slow stable dolly-in",
            "description": f"Hero {product} in a premium urban setting with controlled movement.",
        },
        {
            "id": "clean-studio",
            "name": "Clean Studio Minimal",
            "style": "minimal premium product focus",
            "location": "clean neutral studio",
            "lighting": "soft directional studio light",
            "camera_motion": "locked-off stable camera with subtle push-in",
            "description": f"Clean product-first route for maximum {product} accuracy.",
        },
        {
            "id": "street-lifestyle",
            "name": "Street Lifestyle",
            "style": "realistic lifestyle streetwear",
            "location": "urban street environment",
            "lighting": "natural daylight",
            "camera_motion": "smooth side tracking movement",
            "description": f"Lifestyle route showing {product} in use with more movement.",
        },
    ]


def estimate_confidence(intake: dict, raw_idea: str) -> dict:
    known = sum(1 for key in ["style", "mood", "audience", "platform", "pace", "realism", "product", "location"] if intake.get(key))
    expectation_match = min(95, 45 + known * 6)
    visual_risk = "Low" if known >= 7 else "Medium"
    continuity_risk = "Medium" if contains(raw_idea, ["hand", "logo", "face", "product"]) else "Low"
    recommendation = "Generate preview first" if visual_risk != "Low" or continuity_risk != "Low" else "Safe for preview or final"
    return {
        "expectation_match_score": expectation_match,
        "visual_risk": visual_risk,
        "continuity_risk": continuity_risk,
        "recommendation": recommendation,
    }


def contains(text: str, words: list[str]) -> bool:
    lower = text.lower()
    return any(word in lower for word in words)


def infer_choice(text: str, mapping: dict[str, str], default: str) -> str:
    lower = text.lower()
    return next((value for key, value in mapping.items() if key in lower), default)


def infer_product(text: str) -> str:
    lower = text.lower()
    for product in ["cap", "shoe", "bottle", "shirt", "watch", "bag"]:
        if product in lower:
            return product
    return "hero subject"


def infer_location(text: str) -> str:
    lower = text.lower()
    if "kathmandu" in lower:
        return "Kathmandu rooftop"
    if "campus" in lower:
        return "modern campus"
    if "studio" in lower:
        return "clean studio"
    return "realistic location"
