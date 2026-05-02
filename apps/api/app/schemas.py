from datetime import datetime
from pydantic import BaseModel, Field
from .models import AssuranceStatus, AssetType, JobStatus, LedgerType, MemoryType, TaskType


class PresignUploadRequest(BaseModel):
    filename: str
    content_type: str
    asset_type: AssetType = AssetType.image
    user_id: str | None = None


class PresignUploadResponse(BaseModel):
    asset_id: str
    upload_url: str
    r2_key: str
    public_url: str | None


class CreateJobRequest(BaseModel):
    prompt: str = Field(min_length=1)
    task_type: TaskType
    negative_prompt: str | None = None
    input_asset_id: str | None = None
    user_id: str | None = None
    model_key: str | None = None
    options: dict = Field(default_factory=dict)


class CostEstimateRequest(BaseModel):
    task_type: TaskType
    model_key: str | None = None
    duration_seconds: int = 6
    quality: str = "standard"
    complexity_score: int | None = None
    user_id: str | None = None


class CostEstimateResponse(BaseModel):
    required_credits: int
    estimated_gpu_seconds: int
    price_breakdown: dict
    user_balance: int | None = None
    has_enough_credits: bool | None = None


class ContextPreviewRequest(BaseModel):
    prompt: str = Field(min_length=1)
    task_type: TaskType
    negative_prompt: str | None = None
    input_asset_id: str | None = None
    user_id: str | None = None
    model_key: str | None = None
    duration_seconds: int = 6
    quality: str = "standard"
    options: dict = Field(default_factory=dict)


class ContextPreviewResponse(BaseModel):
    clean_brief: dict
    generation_packet: dict
    final_prompt: str
    negative_prompt: str | None
    complexity_score: int
    complexity_decision: str
    required_credits: int
    estimated_gpu_seconds: int
    price_breakdown: dict
    user_balance: int | None = None
    has_enough_credits: bool | None = None


class PricingPlanIn(BaseModel):
    key: str
    name: str
    price_npr: int = 0
    credits: int
    max_video_seconds: int = 6
    max_jobs_per_month: int | None = None
    features: list[str] = Field(default_factory=list)
    is_active: bool = True


class PricingPlanOut(PricingPlanIn):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WalletResponse(BaseModel):
    user_id: str
    balance: int
    lifetime_credits: int
    lifetime_spent: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreditGrantRequest(BaseModel):
    user_id: str
    amount: int = Field(gt=0)
    reason: str = "admin grant"


class PlanSubscribeRequest(BaseModel):
    user_id: str
    plan_key: str
    cycles: int = Field(default=1, ge=1, le=24)
    payment_reference: str | None = None


class UserTokenRequest(BaseModel):
    user_id: str


class UserTokenResponse(BaseModel):
    user_id: str
    token: str


class CouponIn(BaseModel):
    code: str
    description: str | None = None
    credit_amount: int = Field(ge=0)
    percent_bonus: int = Field(default=0, ge=0, le=100)
    max_redemptions: int | None = None
    expires_at: datetime | None = None
    is_active: bool = True


class CouponOut(CouponIn):
    id: str
    redeemed_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RedeemCouponRequest(BaseModel):
    user_id: str
    code: str
    purchase_credits: int = 0


class LedgerResponse(BaseModel):
    id: str
    user_id: str
    job_id: str | None
    type: LedgerType
    amount: int
    balance_after: int
    reason: str
    meta: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class DesireIntakeRequest(BaseModel):
    raw_idea: str = Field(min_length=1)
    user_id: str | None = None
    project_id: str | None = None
    style: str | None = None
    mood: str | None = None
    audience: str | None = None
    platform: str | None = None
    pace: str | None = None
    realism: str | None = None
    product: str | None = None
    location: str | None = None
    duration_seconds: int | None = None


class AssurancePlanResponse(BaseModel):
    id: str
    user_id: str | None
    project_id: str | None
    raw_idea: str
    structured_intake: dict
    expectation_summary: dict
    concept_options: list
    confidence: dict
    status: AssuranceStatus
    selected_concept_id: str | None
    confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfirmAssuranceRequest(BaseModel):
    selected_concept_id: str | None = None
    edits: dict = Field(default_factory=dict)


class QualityReportResponse(BaseModel):
    id: str
    job_id: str
    technical_checks: dict
    commercial_checks: dict
    passed: bool
    recommendations: list
    created_at: datetime

    model_config = {"from_attributes": True}


class RevisionRequestIn(BaseModel):
    job_id: str
    user_id: str | None = None
    type: str
    target: dict = Field(default_factory=dict)
    instruction: str = Field(min_length=1)


class RevisionRequestOut(RevisionRequestIn):
    id: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackIn(BaseModel):
    job_id: str
    user_id: str | None = None
    approved: bool
    rating: int = Field(ge=1, le=5)
    approved_patterns: list[str] = Field(default_factory=list)
    rejected_patterns: list[str] = Field(default_factory=list)
    notes: str | None = None


class MemoryItemIn(BaseModel):
    user_id: str | None = None
    project_id: str | None = None
    type: MemoryType
    priority: int = 100
    content: str = Field(min_length=1)
    data: dict = Field(default_factory=dict)
    is_active: bool = True


class MemoryItemOut(MemoryItemIn):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptVersionResponse(BaseModel):
    id: str
    job_id: str
    raw_prompt: str
    clean_brief: dict
    generation_packet: dict
    final_prompt: str
    negative_prompt: str | None
    complexity_score: int
    complexity_decision: str
    model_key: str | None
    workflow_file: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobEventResponse(BaseModel):
    id: str
    job_id: str
    event_type: str
    message: str
    meta: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class JobResponse(BaseModel):
    id: str
    task_type: TaskType
    status: JobStatus
    prompt: str
    negative_prompt: str | None
    model_key: str | None
    runpod_endpoint_id: str | None
    runpod_job_id: str | None
    input_asset_id: str | None
    output_asset_id: str | None
    output_url: str | None
    complexity_score: int | None = None
    complexity_decision: str | None = None
    required_credits: int | None = None
    debited_credits: int | None = None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ModelEndpointIn(BaseModel):
    key: str
    provider: str = "runpod"
    endpoint_id: str
    model_name: str
    task_type: TaskType
    workflow_file: str
    is_active: bool = True
    priority: int = 100
    max_concurrency: int = 1
    estimated_cost: float | None = None


class ModelEndpointOut(ModelEndpointIn):
    id: str

    model_config = {"from_attributes": True}
