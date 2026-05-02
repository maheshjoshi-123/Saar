from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    saar_env: str = Field(default="development", alias="SAAR_ENV")
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    cors_origins: str = Field(default="", alias="CORS_ORIGINS")
    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    api_auth_token: str = Field(default="", alias="API_AUTH_TOKEN")
    admin_auth_token: str = Field(default="", alias="ADMIN_AUTH_TOKEN")
    internal_callback_token: str = Field(default="change-me-too", alias="INTERNAL_CALLBACK_TOKEN")
    auto_create_tables: bool = Field(default=True, alias="AUTO_CREATE_TABLES")
    billing_enforced: bool = Field(default=False, alias="BILLING_ENFORCED")
    user_auth_enforced: bool = Field(default=False, alias="USER_AUTH_ENFORCED")
    user_auth_secret: str = Field(default="", alias="USER_AUTH_SECRET")
    user_token_ttl_seconds: int = Field(default=604800, alias="USER_TOKEN_TTL_SECONDS")
    request_body_limit_bytes: int = Field(default=2_000_000, alias="REQUEST_BODY_LIMIT_BYTES")
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=120, alias="RATE_LIMIT_PER_MINUTE")
    admin_rate_limit_per_minute: int = Field(default=30, alias="ADMIN_RATE_LIMIT_PER_MINUTE")
    presign_upload_max_bytes: int = Field(default=104_857_600, alias="PRESIGN_UPLOAD_MAX_BYTES")
    security_headers_enabled: bool = Field(default=True, alias="SECURITY_HEADERS_ENABLED")
    demo_auth_enabled: bool = Field(default=True, alias="DEMO_AUTH_ENABLED")
    mock_payments_enabled: bool = Field(default=True, alias="MOCK_PAYMENTS_ENABLED")

    database_url: str = Field(default="postgresql+psycopg://postgres:postgres@localhost:5432/saar", alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    queue_mode: str = Field(default="celery", alias="QUEUE_MODE")
    runpod_mock: bool = Field(default=False, alias="RUNPOD_MOCK")

    runpod_api_key: str = Field(default="", alias="RUNPOD_API_KEY")
    runpod_default_webhook: str | None = Field(default=None, alias="RUNPOD_DEFAULT_WEBHOOK")
    runpod_wan_t2v_endpoint_id: str | None = Field(default=None, alias="RUNPOD_WAN_T2V_ENDPOINT_ID")
    runpod_wan_i2v_endpoint_id: str | None = Field(default=None, alias="RUNPOD_WAN_I2V_ENDPOINT_ID")
    runpod_ltx_preview_endpoint_id: str | None = Field(default=None, alias="RUNPOD_LTX_PREVIEW_ENDPOINT_ID")
    runpod_hunyuan_endpoint_id: str | None = Field(default=None, alias="RUNPOD_HUNYUAN_ENDPOINT_ID")
    runpod_upscale_endpoint_id: str | None = Field(default=None, alias="RUNPOD_UPSCALE_ENDPOINT_ID")

    r2_account_id: str = Field(default="", alias="R2_ACCOUNT_ID")
    r2_access_key_id: str = Field(default="", alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(default="", alias="R2_SECRET_ACCESS_KEY")
    r2_bucket: str = Field(default="saar-videos", alias="R2_BUCKET")
    r2_public_base_url: str = Field(default="", alias="R2_PUBLIC_BASE_URL")
    r2_region: str = Field(default="auto", alias="R2_REGION")

    workflow_dir: str = Field(default="workflows", alias="WORKFLOW_DIR")
    ollama_enabled: bool = Field(default=True, alias="OLLAMA_ENABLED")
    ollama_model: str = Field(default="qwen2.5:7b", alias="OLLAMA_MODEL")
    ollama_url: str = Field(default="http://localhost:11434", alias="OLLAMA_URL")
    local_reference_dir: str = Field(default="apps/web/public/local-placeholders", alias="LOCAL_REFERENCE_DIR")

    @property
    def allowed_origins(self) -> list[str]:
        explicit = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        return explicit or [self.frontend_url, "http://localhost:3000"]

    @property
    def is_production_like(self) -> bool:
        return self.saar_env.lower() in {"production", "prod", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
