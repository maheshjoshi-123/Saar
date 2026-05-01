import enum
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    submitted = "submitted"
    uploading = "uploading"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class AssuranceStatus(str, enum.Enum):
    draft = "draft"
    awaiting_confirmation = "awaiting_confirmation"
    confirmed = "confirmed"
    preview_requested = "preview_requested"
    final_ready = "final_ready"
    delivered = "delivered"
    needs_revision = "needs_revision"


class TaskType(str, enum.Enum):
    text_to_video_quality = "text_to_video_quality"
    image_to_video = "image_to_video"
    fast_preview = "fast_preview"
    premium_quality = "premium_quality"
    video_upscale = "video_upscale"


class AssetType(str, enum.Enum):
    image = "image"
    video = "video"
    audio = "audio"
    thumbnail = "thumbnail"
    workflow = "workflow"


class MemoryType(str, enum.Enum):
    critical = "critical"
    style = "style"
    optional = "optional"
    failure = "failure"
    brand = "brand"
    subject = "subject"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    type: Mapped[AssetType] = mapped_column(Enum(AssetType))
    r2_key: Mapped[str] = mapped_column(String, index=True)
    public_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModelEndpoint(Base):
    __tablename__ = "model_endpoints"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String, unique=True, index=True)
    provider: Mapped[str] = mapped_column(String, default="runpod")
    endpoint_id: Mapped[str] = mapped_column(String)
    model_name: Mapped[str] = mapped_column(String)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), index=True)
    workflow_file: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    max_concurrency: Mapped[int] = mapped_column(Integer, default=1)
    estimated_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType), index=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.queued, index=True)
    prompt: Mapped[str] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_key: Mapped[str | None] = mapped_column(String, nullable=True)
    runpod_endpoint_id: Mapped[str | None] = mapped_column(String, nullable=True)
    runpod_job_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    workflow_id: Mapped[str | None] = mapped_column(String, nullable=True)
    input_asset_id: Mapped[str | None] = mapped_column(String, ForeignKey("assets.id"), nullable=True)
    output_asset_id: Mapped[str | None] = mapped_column(String, ForeignKey("assets.id"), nullable=True)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    input_asset: Mapped[Asset | None] = relationship(foreign_keys=[input_asset_id])
    output_asset: Mapped[Asset | None] = relationship(foreign_keys=[output_asset_id])


class MemoryItem(Base):
    __tablename__ = "memory_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    type: Mapped[MemoryType] = mapped_column(Enum(MemoryType), index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    content: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), index=True)
    raw_prompt: Mapped[str] = mapped_column(Text)
    clean_brief: Mapped[dict] = mapped_column(JSON, default=dict)
    generation_packet: Mapped[dict] = mapped_column(JSON, default=dict)
    final_prompt: Mapped[str] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    complexity_score: Mapped[int] = mapped_column(Integer, default=0)
    complexity_decision: Mapped[str] = mapped_column(String, default="safe")
    model_key: Mapped[str | None] = mapped_column(String, nullable=True)
    workflow_file: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AssurancePlan(Base):
    __tablename__ = "assurance_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    raw_idea: Mapped[str] = mapped_column(Text)
    structured_intake: Mapped[dict] = mapped_column(JSON, default=dict)
    expectation_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    concept_options: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[AssuranceStatus] = mapped_column(Enum(AssuranceStatus), default=AssuranceStatus.awaiting_confirmation, index=True)
    selected_concept_id: Mapped[str | None] = mapped_column(String, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QualityReport(Base):
    __tablename__ = "quality_reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), index=True)
    technical_checks: Mapped[dict] = mapped_column(JSON, default=dict)
    commercial_checks: Mapped[dict] = mapped_column(JSON, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    recommendations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RevisionRequest(Base):
    __tablename__ = "revision_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String, index=True)
    target: Mapped[dict] = mapped_column(JSON, default=dict)
    instruction: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


Index("idx_jobs_status_created", Job.status, Job.created_at)
Index("idx_model_task_active", ModelEndpoint.task_type, ModelEndpoint.is_active)
Index("idx_memory_scope", MemoryItem.user_id, MemoryItem.project_id, MemoryItem.type, MemoryItem.is_active)
Index("idx_assurance_scope", AssurancePlan.user_id, AssurancePlan.project_id, AssurancePlan.status)
