import uuid
from datetime import datetime
from pathlib import PurePath
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .db import get_db, init_db
from .assurance import build_options_from_assurance, confirm_assurance_plan, create_assurance_plan, create_quality_report, create_revision_request, store_feedback_memory
from .context_compiler import compile_generation_context
from .models import AssurancePlan, AssuranceStatus, Asset, AssetType, Job, JobEvent, JobStatus, MemoryItem, ModelEndpoint, PromptVersion, QualityReport, RevisionRequest, TaskType
from .preflight import check_preflight
from .r2 import presign_put, public_url_for_key
from .router import resolve_endpoint
from .schemas import AssurancePlanResponse, ConfirmAssuranceRequest, CreateJobRequest, DesireIntakeRequest, FeedbackIn, JobEventResponse, JobResponse, MemoryItemIn, MemoryItemOut, ModelEndpointIn, ModelEndpointOut, PresignUploadRequest, PresignUploadResponse, PromptVersionResponse, QualityReportResponse, RevisionRequestIn, RevisionRequestOut
from .security import require_admin_token, require_api_token
from .tasks import process_job


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        init_db()
    yield


app = FastAPI(title="Saar API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "env": settings.saar_env}


@app.get("/ready")
def ready() -> dict:
    return check_preflight()


@app.post("/api/assets/presign-upload", response_model=PresignUploadResponse, dependencies=[Depends(require_api_token)])
def presign_upload(body: PresignUploadRequest, db: Session = Depends(get_db)) -> PresignUploadResponse:
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
def create_job(body: CreateJobRequest, db: Session = Depends(get_db)) -> JobResponse:
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

    job = Job(
        user_id=body.user_id,
        task_type=body.task_type,
        prompt=body.prompt,
        negative_prompt=compiled.negative_prompt,
        input_asset_id=body.input_asset_id,
        model_key=endpoint.key,
        runpod_endpoint_id=endpoint.endpoint_id,
        options={**body.options, "compiled": True, "complexity_score": compiled.complexity_score, "complexity_decision": compiled.complexity_decision},
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
def assurance_intake(body: DesireIntakeRequest, db: Session = Depends(get_db)) -> AssurancePlan:
    return create_assurance_plan(db, body)


@app.post("/api/assurance/{plan_id}/confirm", response_model=AssurancePlanResponse, dependencies=[Depends(require_api_token)])
def assurance_confirm(plan_id: str, body: ConfirmAssuranceRequest, db: Session = Depends(get_db)) -> AssurancePlan:
    plan = db.get(AssurancePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Assurance plan not found")
    return confirm_assurance_plan(db, plan, body.selected_concept_id, body.edits)


@app.post("/api/assurance/{plan_id}/jobs", response_model=JobResponse, dependencies=[Depends(require_api_token)])
def create_job_from_assurance(plan_id: str, body: CreateJobRequest, db: Session = Depends(get_db)) -> JobResponse:
    plan = db.get(AssurancePlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Assurance plan not found")
    if plan.status != AssuranceStatus.confirmed:
        raise HTTPException(status_code=400, detail="Assurance plan must be confirmed before generation")
    body.prompt = body.prompt or plan.raw_idea
    body.user_id = body.user_id or plan.user_id
    body.options = build_options_from_assurance(plan, {**body.options, "assurance_plan_id": plan.id, "project_id": plan.project_id})
    return create_job(body, db)


@app.get("/api/jobs", response_model=list[JobResponse], dependencies=[Depends(require_api_token)])
def list_jobs(db: Session = Depends(get_db)) -> list[JobResponse]:
    jobs = db.execute(select(Job).order_by(Job.created_at.desc()).limit(100)).scalars().all()
    return [to_job_response(job) for job in jobs]


@app.get("/api/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_token)])
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobResponse:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return to_job_response(job)


@app.get("/api/jobs/{job_id}/events", response_model=list[JobEventResponse], dependencies=[Depends(require_api_token)])
def get_job_events(job_id: str, db: Session = Depends(get_db)) -> list[JobEvent]:
    if not db.get(Job, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return list(db.execute(select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.created_at.asc())).scalars().all())


@app.post("/api/jobs/{job_id}/quality-report", response_model=QualityReportResponse, dependencies=[Depends(require_api_token)])
def generate_quality_report(job_id: str, db: Session = Depends(get_db)) -> QualityReport:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return create_quality_report(db, job)


@app.post("/api/revisions", response_model=RevisionRequestOut, dependencies=[Depends(require_api_token)])
def create_revision(body: RevisionRequestIn, db: Session = Depends(get_db)) -> RevisionRequest:
    if not db.get(Job, body.job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return create_revision_request(db, job_id=body.job_id, user_id=body.user_id, type=body.type, target=body.target, instruction=body.instruction)


@app.post("/api/feedback", response_model=list[MemoryItemOut], dependencies=[Depends(require_api_token)])
def submit_feedback(body: FeedbackIn, db: Session = Depends(get_db)) -> list[MemoryItem]:
    if not db.get(Job, body.job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return store_feedback_memory(db, body)


@app.get("/api/jobs/{job_id}/prompt-version", response_model=PromptVersionResponse, dependencies=[Depends(require_api_token)])
def get_prompt_version(job_id: str, db: Session = Depends(get_db)) -> PromptVersion:
    row = db.execute(select(PromptVersion).where(PromptVersion.job_id == job_id).order_by(PromptVersion.created_at.desc())).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    return row


@app.post("/api/memory", response_model=MemoryItemOut, dependencies=[Depends(require_api_token)])
def create_memory(body: MemoryItemIn, db: Session = Depends(get_db)) -> MemoryItem:
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
def list_memory(user_id: str | None = None, project_id: str | None = None, db: Session = Depends(get_db)) -> list[MemoryItem]:
    query = select(MemoryItem).where(MemoryItem.is_active.is_(True))
    if user_id:
        query = query.where(MemoryItem.user_id == user_id)
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
    return list(db.execute(select(ModelEndpoint).order_by(ModelEndpoint.priority.asc())).scalars().all())


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
        error=job.error,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )
