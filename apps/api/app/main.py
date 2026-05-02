import uuid
from datetime import datetime
from pathlib import PurePath
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .db import get_db, init_db
from .assurance import build_options_from_assurance, confirm_assurance_plan, create_assurance_plan, create_quality_report, create_revision_request, store_feedback_memory
from .billing import add_credits, debit_credits, estimate_generation_cost, get_wallet, redeem_coupon, refund_credits, seed_default_plans
from .context_compiler import compile_generation_context
from .generation_packet import build_generation_packet
from .intelligence_memory import retrieve_structured_memory
from .models import AssurancePlan, AssuranceStatus, Asset, AssetType, Coupon, CreditLedger, CreditWallet, Job, JobEvent, JobStatus, LedgerType, MemoryItem, ModelEndpoint, PricingPlan, PromptVersion, QualityReport, RevisionRequest, TaskType
from .preflight import check_preflight
from .prompt_refinement import build_intelligence_inputs
from .r2 import presign_put, public_url_for_key
from .router import list_available_endpoints, resolve_endpoint
from .schemas import AssurancePlanResponse, ConfirmAssuranceRequest, ContextPreviewRequest, ContextPreviewResponse, CostEstimateRequest, CostEstimateResponse, CouponIn, CouponOut, CreditGrantRequest, CreateJobRequest, DesireIntakeRequest, FeedbackIn, IntelligencePacketRequest, IntelligencePacketResponse, JobEventResponse, JobResponse, LedgerResponse, MemoryItemIn, MemoryItemOut, ModelEndpointIn, ModelEndpointOut, PlanSubscribeRequest, PresignUploadRequest, PresignUploadResponse, PricingPlanIn, PricingPlanOut, PromptVersionResponse, QualityReportResponse, RedeemCouponRequest, RevisionRequestIn, RevisionRequestOut, UsageSummaryResponse, UserTokenRequest, UserTokenResponse, WalletResponse
from .security import require_admin_token, require_api_token, require_user_scope, sign_user_token
from .tasks import process_job


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        init_db()
        from .db import SessionLocal
        db = SessionLocal()
        try:
            seed_default_plans(db)
        finally:
            db.close()
    yield


app = FastAPI(title="Saar API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _duration_from_options(options: dict) -> int:
    raw = options.get("duration_seconds") or options.get("duration") or 6
    if isinstance(raw, str):
        digits = "".join(ch for ch in raw if ch.isdigit())
        raw = digits or 6
    try:
        return max(1, min(int(raw), 60))
    except (TypeError, ValueError):
        return 6


def _scoped_user(user_id: str | None, x_saar_user_id: str | None, x_saar_user_token: str | None) -> str | None:
    return require_user_scope(user_id, x_saar_user_id, x_saar_user_token)


def _assert_job_access(job: Job, user_id: str | None, x_saar_user_id: str | None, x_saar_user_token: str | None) -> None:
    if settings.user_auth_enforced:
        _scoped_user(user_id or job.user_id, x_saar_user_id, x_saar_user_token)
        if job.user_id and user_id and job.user_id != user_id:
            raise HTTPException(status_code=403, detail="Job does not belong to this user")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "env": settings.saar_env}


@app.get("/")
def root() -> dict:
    return {
        "ok": True,
        "service": "Saar API",
        "version": app.version,
        "health": "/health",
        "ready": "/ready",
        "docs": "/docs",
        "api": "/api",
    }


@app.get("/ready")
def ready() -> dict:
    return check_preflight()


@app.post("/api/assets/presign-upload", response_model=PresignUploadResponse, dependencies=[Depends(require_api_token)])
def presign_upload(body: PresignUploadRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> PresignUploadResponse:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    safe_name = PurePath(body.filename.replace("\\", "/")).name.replace(" ", "_")
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    key = f"inputs/{body.user_id or 'anonymous'}/{uuid.uuid4()}-{safe_name}"
    asset = Asset(user_id=body.user_id, type=body.asset_type, r2_key=key, public_url=public_url_for_key(key), mime_type=body.content_type)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return PresignUploadResponse(asset_id=asset.id, upload_url=presign_put(key, body.content_type), r2_key=key, public_url=asset.public_url)


@app.post("/api/jobs", response_model=JobResponse, dependencies=[Depends(require_api_token)])
def create_job(body: CreateJobRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> JobResponse:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    if body.options.get("assurance_plan_id"):
        plan = db.get(AssurancePlan, body.options["assurance_plan_id"])
        if not plan:
            raise HTTPException(status_code=400, detail="assurance_plan_id does not exist")
        if plan.status != AssuranceStatus.confirmed:
            raise HTTPException(status_code=400, detail="Assurance plan must be confirmed before generation")
        body.options = build_options_from_assurance(plan, body.options)
    if body.input_asset_id:
        asset = db.get(Asset, body.input_asset_id)
        if not asset:
            raise HTTPException(status_code=400, detail="input_asset_id does not exist")
        if asset.user_id and body.user_id and asset.user_id != body.user_id:
            raise HTTPException(status_code=403, detail="input_asset_id does not belong to this user")
        if settings.user_auth_enforced and asset.user_id != body.user_id:
            raise HTTPException(status_code=403, detail="input_asset_id does not belong to this user")
    else:
        asset = None

    if body.task_type in {TaskType.image_to_video, TaskType.video_upscale} and not asset:
        raise HTTPException(status_code=400, detail=f"{body.task_type.value} requires input_asset_id")
    if body.task_type == TaskType.image_to_video and asset and asset.type != AssetType.image:
        raise HTTPException(status_code=400, detail="image_to_video requires an image asset")
    if body.task_type == TaskType.video_upscale and asset and asset.type != AssetType.video:
        raise HTTPException(status_code=400, detail="video_upscale requires a video asset")

    try:
        endpoint = resolve_endpoint(db, body.task_type, body.model_key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Model routing failed: {exc}") from exc

    try:
        compiled = compile_generation_context(
            db,
            raw_prompt=body.prompt,
            task_type=body.task_type,
            endpoint=endpoint,
            input_asset=asset,
            user_id=body.user_id,
            project_id=body.options.get("project_id"),
            explicit_negative=body.negative_prompt,
            options=body.options,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prompt compilation failed: {exc}") from exc

    duration_seconds = _duration_from_options(body.options)
    quality = body.options.get("quality") or ("premium" if body.task_type == TaskType.premium_quality else "standard")
    estimate = estimate_generation_cost(body.task_type, duration_seconds=duration_seconds, quality=quality, complexity_score=compiled.complexity_score, model_key=endpoint.key)
    if settings.billing_enforced:
        if not body.user_id:
            raise HTTPException(status_code=400, detail="user_id is required when billing is enforced")
        wallet = get_wallet(db, body.user_id, create=True)
        if not wallet or wallet.balance < estimate["required_credits"]:
            available = wallet.balance if wallet else 0
            raise HTTPException(status_code=402, detail=f"Insufficient credits: required {estimate['required_credits']}, available {available}")

    job = Job(
        user_id=body.user_id,
        task_type=body.task_type,
        prompt=body.prompt,
        negative_prompt=compiled.negative_prompt,
        input_asset_id=body.input_asset_id,
        model_key=endpoint.key,
        runpod_endpoint_id=endpoint.endpoint_id,
        options={**body.options, "compiled": True, "complexity_score": compiled.complexity_score, "complexity_decision": compiled.complexity_decision, "required_credits": estimate["required_credits"], "estimated_gpu_seconds": estimate["estimated_gpu_seconds"], "billing_debited": False},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    prompt_version = PromptVersion(
        job_id=job.id,
        raw_prompt=body.prompt,
        clean_brief=compiled.clean_brief,
        generation_packet=compiled.generation_packet,
        final_prompt=compiled.final_prompt,
        negative_prompt=compiled.negative_prompt,
        complexity_score=compiled.complexity_score,
        complexity_decision=compiled.complexity_decision,
        model_key=endpoint.key,
        workflow_file=endpoint.workflow_file,
    )
    db.add(prompt_version)
    db.commit()
    if settings.billing_enforced and body.user_id:
        try:
            debit_credits(db, user_id=body.user_id, amount=estimate["required_credits"], job_id=job.id, reason="video generation reservation", meta=estimate["price_breakdown"])
            job.options = {**job.options, "billing_debited": True, "debited_credits": estimate["required_credits"]}
            db.commit()
        except ValueError as exc:
            job.status = JobStatus.failed
            job.error = str(exc)
            db.commit()
            raise HTTPException(status_code=402, detail=str(exc)) from exc
    try:
        if settings.queue_mode == "inline":
            process_job.apply(args=[job.id])
        else:
            process_job.delay(job.id)
    except Exception as exc:
        job.status = JobStatus.failed
        job.error = f"Failed to enqueue job: {exc}"
        db.commit()
        raise HTTPException(status_code=503, detail=job.error) from exc
    return to_job_response(job)


@app.post("/api/assurance/intake", response_model=AssurancePlanResponse, dependencies=[Depends(require_api_token)])
def assurance_intake(body: DesireIntakeRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> AssurancePlan:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    return create_assurance_plan(db, body)


@app.post("/api/jobs/estimate", response_model=CostEstimateResponse, dependencies=[Depends(require_api_token)])
def estimate_job_cost(body: CostEstimateRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> CostEstimateResponse:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    try:
        endpoint = resolve_endpoint(db, body.task_type, body.model_key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Model routing failed: {exc}") from exc
    estimate = estimate_generation_cost(body.task_type, duration_seconds=body.duration_seconds, quality=body.quality, complexity_score=body.complexity_score, model_key=endpoint.key)
    wallet = get_wallet(db, body.user_id, create=True) if body.user_id else None
    return CostEstimateResponse(
        **estimate,
        user_balance=wallet.balance if wallet else None,
        has_enough_credits=(wallet.balance >= estimate["required_credits"]) if wallet else None,
    )


@app.post("/api/context/preview", response_model=ContextPreviewResponse, dependencies=[Depends(require_api_token)])
def preview_generation_context(body: ContextPreviewRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> ContextPreviewResponse:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    asset = db.get(Asset, body.input_asset_id) if body.input_asset_id else None
    if body.input_asset_id and not asset:
        raise HTTPException(status_code=400, detail="input_asset_id does not exist")
    if asset and asset.user_id and body.user_id and asset.user_id != body.user_id:
        raise HTTPException(status_code=403, detail="input_asset_id does not belong to this user")
    try:
        endpoint = resolve_endpoint(db, body.task_type, body.model_key)
        compiled = compile_generation_context(
            db,
            raw_prompt=body.prompt,
            task_type=body.task_type,
            endpoint=endpoint,
            input_asset=asset,
            user_id=body.user_id,
            project_id=body.options.get("project_id"),
            explicit_negative=body.negative_prompt,
            options={**body.options, "duration": f"{body.duration_seconds} seconds"},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Context preview failed: {exc}") from exc

    estimate = estimate_generation_cost(body.task_type, duration_seconds=body.duration_seconds, quality=body.quality, complexity_score=compiled.complexity_score, model_key=endpoint.key)
    wallet = get_wallet(db, body.user_id, create=True) if body.user_id else None
    return ContextPreviewResponse(
        clean_brief=compiled.clean_brief,
        generation_packet=compiled.generation_packet,
        final_prompt=compiled.final_prompt,
        negative_prompt=compiled.negative_prompt,
        complexity_score=compiled.complexity_score,
        complexity_decision=compiled.complexity_decision,
        **estimate,
        user_balance=wallet.balance if wallet else None,
        has_enough_credits=(wallet.balance >= estimate["required_credits"]) if wallet else None,
    )


@app.post("/api/intelligence/packet", response_model=IntelligencePacketResponse, dependencies=[Depends(require_api_token)])
def build_intelligence_packet(body: IntelligencePacketRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> IntelligencePacketResponse:
    user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    memory = retrieve_structured_memory(db, user_id=user_id, project_id=body.project_id)
    settings, active_context, brief = build_intelligence_inputs(body.raw_prompt, body.settings, memory)
    packet = build_generation_packet(
        user_id=user_id,
        route=body.route,
        raw_prompt=body.raw_prompt,
        settings=settings,
        memory=memory,
        active_context=active_context,
        brief=brief,
        existing_scene_plan=body.scene_plan,
        existing_keyframes=body.keyframes,
        edit_scene_id=body.edit_scene_id,
        scene_patch=body.scene_patch,
        edit_keyframe_id=body.edit_keyframe_id,
        keyframe_patch=body.keyframe_patch,
    )
    return IntelligencePacketResponse(
        packet=packet,
        quality_gate=packet["quality_gate"],
        scene_plan=packet["scene_plan"],
        reference_images=packet["reference_images"],
        keyframes=packet["keyframes"],
        final_video_prompt=packet["final_video_prompt"],
    )


@app.post("/api/assurance/{plan_id}/confirm", response_model=AssurancePlanResponse, dependencies=[Depends(require_api_token)])
def assurance_confirm(plan_id: str, body: ConfirmAssuranceRequest, db: Session = Depends(get_db), user_id: str | None = Query(default=None), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> AssurancePlan:
    plan = db.get(AssurancePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Assurance plan not found")
    if settings.user_auth_enforced:
        _scoped_user(user_id or plan.user_id, x_saar_user_id, x_saar_user_token)
        if plan.user_id and user_id and plan.user_id != user_id:
            raise HTTPException(status_code=403, detail="Assurance plan does not belong to this user")
    return confirm_assurance_plan(db, plan, body.selected_concept_id, body.edits)


@app.post("/api/assurance/{plan_id}/jobs", response_model=JobResponse, dependencies=[Depends(require_api_token)])
def create_job_from_assurance(plan_id: str, body: CreateJobRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> JobResponse:
    plan = db.get(AssurancePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Assurance plan not found")
    if plan.status != AssuranceStatus.confirmed:
        raise HTTPException(status_code=400, detail="Assurance plan must be confirmed before generation")
    body.prompt = body.prompt or plan.raw_idea
    body.user_id = body.user_id or plan.user_id
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    if settings.user_auth_enforced and plan.user_id and body.user_id != plan.user_id:
        raise HTTPException(status_code=403, detail="Assurance plan does not belong to this user")
    body.options = build_options_from_assurance(plan, {**body.options, "assurance_plan_id": plan.id, "project_id": plan.project_id})
    return create_job(body, db, x_saar_user_id=x_saar_user_id, x_saar_user_token=x_saar_user_token)


@app.get("/api/jobs", response_model=list[JobResponse], dependencies=[Depends(require_api_token)])
def list_jobs(user_id: str | None = Query(default=None), db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> list[JobResponse]:
    scoped_user = _scoped_user(user_id, x_saar_user_id, x_saar_user_token)
    query = select(Job).order_by(Job.created_at.desc()).limit(100)
    if scoped_user:
        query = select(Job).where(Job.user_id == scoped_user).order_by(Job.created_at.desc()).limit(100)
    elif settings.user_auth_enforced:
        raise HTTPException(status_code=400, detail="user_id is required")
    jobs = db.execute(query).scalars().all()
    return [to_job_response(job) for job in jobs]


@app.get("/api/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_token)])
def get_job(job_id: str, user_id: str | None = Query(default=None), db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> JobResponse:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_job_access(job, user_id, x_saar_user_id, x_saar_user_token)
    return to_job_response(job)


@app.get("/api/jobs/{job_id}/events", response_model=list[JobEventResponse], dependencies=[Depends(require_api_token)])
def get_job_events(job_id: str, user_id: str | None = Query(default=None), db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> list[JobEvent]:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_job_access(job, user_id, x_saar_user_id, x_saar_user_token)
    return list(db.execute(select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.created_at.asc())).scalars().all())


@app.post("/api/jobs/{job_id}/quality-report", response_model=QualityReportResponse, dependencies=[Depends(require_api_token)])
def generate_quality_report(job_id: str, user_id: str | None = Query(default=None), db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> QualityReport:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_job_access(job, user_id, x_saar_user_id, x_saar_user_token)
    return create_quality_report(db, job)


@app.post("/api/revisions", response_model=RevisionRequestOut, dependencies=[Depends(require_api_token)])
def create_revision(body: RevisionRequestIn, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> RevisionRequest:
    job = db.get(Job, body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    body.user_id = _scoped_user(body.user_id or job.user_id, x_saar_user_id, x_saar_user_token)
    _assert_job_access(job, body.user_id, x_saar_user_id, x_saar_user_token)
    return create_revision_request(db, job_id=body.job_id, user_id=body.user_id, type=body.type, target=body.target, instruction=body.instruction)


@app.post("/api/feedback", response_model=list[MemoryItemOut], dependencies=[Depends(require_api_token)])
def submit_feedback(body: FeedbackIn, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> list[MemoryItem]:
    job = db.get(Job, body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    body.user_id = _scoped_user(body.user_id or job.user_id, x_saar_user_id, x_saar_user_token)
    _assert_job_access(job, body.user_id, x_saar_user_id, x_saar_user_token)
    return store_feedback_memory(db, body)


@app.get("/api/pricing/plans", response_model=list[PricingPlanOut], dependencies=[Depends(require_api_token)])
def list_pricing_plans(db: Session = Depends(get_db)) -> list[PricingPlan]:
    return list(db.execute(select(PricingPlan).where(PricingPlan.is_active.is_(True)).order_by(PricingPlan.price_npr.asc())).scalars().all())


@app.post("/api/admin/pricing/plans", response_model=PricingPlanOut, dependencies=[Depends(require_admin_token)])
def upsert_pricing_plan(body: PricingPlanIn, db: Session = Depends(get_db)) -> PricingPlan:
    plan = db.execute(select(PricingPlan).where(PricingPlan.key == body.key)).scalars().first()
    if not plan:
        plan = PricingPlan(key=body.key, name=body.name, credits=body.credits)
        db.add(plan)
    plan.name = body.name
    plan.price_npr = body.price_npr
    plan.credits = body.credits
    plan.max_video_seconds = body.max_video_seconds
    plan.max_jobs_per_month = body.max_jobs_per_month
    plan.features = body.features
    plan.is_active = body.is_active
    db.commit()
    db.refresh(plan)
    return plan


@app.get("/api/billing/wallet", response_model=WalletResponse, dependencies=[Depends(require_api_token)])
def get_billing_wallet(user_id: str, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> CreditWallet:
    _scoped_user(user_id, x_saar_user_id, x_saar_user_token)
    wallet = get_wallet(db, user_id, create=True)
    assert wallet is not None
    return wallet


@app.get("/api/billing/ledger", response_model=list[LedgerResponse], dependencies=[Depends(require_api_token)])
def get_billing_ledger(user_id: str, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> list[CreditLedger]:
    _scoped_user(user_id, x_saar_user_id, x_saar_user_token)
    return list(db.execute(select(CreditLedger).where(CreditLedger.user_id == user_id).order_by(CreditLedger.created_at.desc()).limit(100)).scalars().all())


@app.get("/api/admin/usage/summary", response_model=UsageSummaryResponse, dependencies=[Depends(require_admin_token)])
def admin_usage_summary(db: Session = Depends(get_db)) -> UsageSummaryResponse:
    jobs = list(db.execute(select(Job).order_by(Job.created_at.desc()).limit(10000)).scalars().all())
    ledger = list(db.execute(select(CreditLedger).order_by(CreditLedger.created_at.desc()).limit(10000)).scalars().all())
    jobs_by_task: dict[str, int] = {}
    jobs_by_model: dict[str, int] = {}
    credits_by_user: dict[str, int] = {}
    for job in jobs:
        jobs_by_task[job.task_type.value] = jobs_by_task.get(job.task_type.value, 0) + 1
        jobs_by_model[job.model_key or "auto"] = jobs_by_model.get(job.model_key or "auto", 0) + 1
    for row in ledger:
        if row.type == LedgerType.debit:
            credits_by_user[row.user_id] = credits_by_user.get(row.user_id, 0) + abs(row.amount)
    return UsageSummaryResponse(
        total_jobs=len(jobs),
        completed_jobs=sum(1 for job in jobs if job.status == JobStatus.completed),
        failed_jobs=sum(1 for job in jobs if job.status == JobStatus.failed),
        running_jobs=sum(1 for job in jobs if job.status in {JobStatus.queued, JobStatus.running, JobStatus.submitted, JobStatus.uploading}),
        total_credits_spent=sum(abs(row.amount) for row in ledger if row.type == LedgerType.debit),
        total_credits_granted=sum(row.amount for row in ledger if row.type in {LedgerType.grant, LedgerType.coupon}),
        jobs_by_task=jobs_by_task,
        jobs_by_model=jobs_by_model,
        credits_by_user=credits_by_user,
    )


@app.post("/api/admin/billing/grant", response_model=WalletResponse, dependencies=[Depends(require_admin_token)])
def admin_grant_credits(body: CreditGrantRequest, db: Session = Depends(get_db)) -> CreditWallet:
    return add_credits(db, user_id=body.user_id, amount=body.amount, reason=body.reason, ledger_type=LedgerType.grant)


@app.post("/api/admin/billing/subscribe", response_model=WalletResponse, dependencies=[Depends(require_admin_token)])
def admin_subscribe_plan(body: PlanSubscribeRequest, db: Session = Depends(get_db)) -> CreditWallet:
    plan = db.execute(select(PricingPlan).where(PricingPlan.key == body.plan_key, PricingPlan.is_active.is_(True))).scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Pricing plan not found or inactive")
    credits = plan.credits * body.cycles
    return add_credits(
        db,
        user_id=body.user_id,
        amount=credits,
        reason=f"subscription plan {plan.key}",
        ledger_type=LedgerType.grant,
        meta={
            "plan_key": plan.key,
            "plan_name": plan.name,
            "cycles": body.cycles,
            "price_npr": plan.price_npr * body.cycles,
            "payment_reference": body.payment_reference,
        },
    )


@app.post("/api/admin/users/token", response_model=UserTokenResponse, dependencies=[Depends(require_admin_token)])
def admin_issue_user_token(body: UserTokenRequest) -> UserTokenResponse:
    if not settings.user_auth_secret:
        raise HTTPException(status_code=503, detail="USER_AUTH_SECRET is required to issue user tokens")
    return UserTokenResponse(user_id=body.user_id, token=sign_user_token(body.user_id, settings.user_auth_secret))


@app.post("/api/admin/coupons", response_model=CouponOut, dependencies=[Depends(require_admin_token)])
def admin_create_coupon(body: CouponIn, db: Session = Depends(get_db)) -> Coupon:
    existing = db.execute(select(Coupon).where(Coupon.code == body.code.strip().upper())).scalars().first()
    if existing:
        coupon = existing
    else:
        coupon = Coupon(code=body.code.strip().upper())
        db.add(coupon)
    coupon.description = body.description
    coupon.credit_amount = body.credit_amount
    coupon.percent_bonus = body.percent_bonus
    coupon.max_redemptions = body.max_redemptions
    coupon.expires_at = body.expires_at
    coupon.is_active = body.is_active
    db.commit()
    db.refresh(coupon)
    return coupon


@app.get("/api/admin/coupons", response_model=list[CouponOut], dependencies=[Depends(require_admin_token)])
def admin_list_coupons(db: Session = Depends(get_db)) -> list[Coupon]:
    return list(db.execute(select(Coupon).order_by(Coupon.created_at.desc()).limit(100)).scalars().all())


@app.post("/api/coupons/redeem", response_model=WalletResponse, dependencies=[Depends(require_api_token)])
def redeem_coupon_endpoint(body: RedeemCouponRequest, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> CreditWallet:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    try:
        return redeem_coupon(db, user_id=body.user_id, code=body.code, purchase_credits=body.purchase_credits)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/jobs/{job_id}/prompt-version", response_model=PromptVersionResponse, dependencies=[Depends(require_api_token)])
def get_prompt_version(job_id: str, user_id: str | None = Query(default=None), db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> PromptVersion:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_job_access(job, user_id, x_saar_user_id, x_saar_user_token)
    row = db.execute(select(PromptVersion).where(PromptVersion.job_id == job_id).order_by(PromptVersion.created_at.desc())).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    return row


@app.post("/api/memory", response_model=MemoryItemOut, dependencies=[Depends(require_api_token)])
def create_memory(body: MemoryItemIn, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> MemoryItem:
    body.user_id = _scoped_user(body.user_id, x_saar_user_id, x_saar_user_token)
    item = MemoryItem(
        user_id=body.user_id,
        project_id=body.project_id,
        type=body.type,
        priority=body.priority,
        content=body.content,
        data=body.data,
        is_active=body.is_active,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/memory", response_model=list[MemoryItemOut], dependencies=[Depends(require_api_token)])
def list_memory(user_id: str | None = None, project_id: str | None = None, db: Session = Depends(get_db), x_saar_user_id: str | None = Header(default=None), x_saar_user_token: str | None = Header(default=None)) -> list[MemoryItem]:
    scoped_user = _scoped_user(user_id, x_saar_user_id, x_saar_user_token)
    query = select(MemoryItem).where(MemoryItem.is_active.is_(True))
    if scoped_user:
        query = query.where(MemoryItem.user_id == scoped_user)
    elif settings.user_auth_enforced:
        raise HTTPException(status_code=400, detail="user_id is required")
    if project_id:
        query = query.where(MemoryItem.project_id == project_id)
    return list(db.execute(query.order_by(MemoryItem.priority.asc(), MemoryItem.created_at.desc()).limit(100)).scalars().all())


@app.post("/api/admin/model-endpoints", response_model=ModelEndpointOut, dependencies=[Depends(require_admin_token)])
def upsert_model_endpoint(body: ModelEndpointIn, db: Session = Depends(get_db)) -> ModelEndpoint:
    endpoint = db.execute(select(ModelEndpoint).where(ModelEndpoint.key == body.key)).scalars().first()
    if not endpoint:
        endpoint = ModelEndpoint(key=body.key, endpoint_id=body.endpoint_id, model_name=body.model_name, task_type=body.task_type, workflow_file=body.workflow_file)
        db.add(endpoint)
    endpoint.endpoint_id = body.endpoint_id
    endpoint.model_name = body.model_name
    endpoint.provider = body.provider
    endpoint.task_type = body.task_type
    endpoint.workflow_file = body.workflow_file
    endpoint.is_active = body.is_active
    endpoint.priority = body.priority
    endpoint.max_concurrency = body.max_concurrency
    endpoint.estimated_cost = body.estimated_cost
    db.commit()
    db.refresh(endpoint)
    return endpoint


@app.get("/api/models", response_model=list[ModelEndpointOut], dependencies=[Depends(require_api_token)])
def list_models(db: Session = Depends(get_db)) -> list[ModelEndpoint]:
    return list_available_endpoints(db)


@app.post("/api/runpod/webhook")
def runpod_webhook(payload: dict, x_saar_token: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict:
    if x_saar_token != settings.internal_callback_token:
        raise HTTPException(status_code=401, detail="Invalid callback token")
    metadata = (payload.get("input") or {}).get("metadata") or payload.get("metadata") or {}
    job_id = metadata.get("job_id") or payload.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="Missing job_id")
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    output = payload.get("output") or {}
    if payload.get("status") in {"FAILED", "CANCELLED", "TIMED_OUT"} or (isinstance(output, dict) and output.get("error")):
        if (
            job.user_id
            and isinstance(job.options, dict)
            and job.options.get("billing_debited")
            and job.options.get("debited_credits")
            and not job.options.get("billing_refunded")
        ):
            refund_credits(db, user_id=job.user_id, amount=int(job.options["debited_credits"]), job_id=job.id, reason="automatic refund after RunPod webhook failure")
            job.options = {**job.options, "billing_refunded": True}
        job.status = JobStatus.failed
        job.error = str(payload.get("error") or (output.get("error") if isinstance(output, dict) else None) or payload)
    elif payload.get("status") == "COMPLETED":
        job.status = JobStatus.completed
        job.completed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


def to_job_response(job: Job) -> JobResponse:
    output_url = job.output_asset.public_url if job.output_asset else None
    return JobResponse(
        id=job.id,
        task_type=job.task_type,
        status=job.status,
        prompt=job.prompt,
        negative_prompt=job.negative_prompt,
        model_key=job.model_key,
        runpod_endpoint_id=job.runpod_endpoint_id,
        runpod_job_id=job.runpod_job_id,
        input_asset_id=job.input_asset_id,
        output_asset_id=job.output_asset_id,
        output_url=output_url,
        complexity_score=job.options.get("complexity_score") if isinstance(job.options, dict) else None,
        complexity_decision=job.options.get("complexity_decision") if isinstance(job.options, dict) else None,
        required_credits=job.options.get("required_credits") if isinstance(job.options, dict) else None,
        debited_credits=job.options.get("debited_credits") if isinstance(job.options, dict) else None,
        error=job.error,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )
