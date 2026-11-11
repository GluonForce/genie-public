from pathlib import Path
from typing import Any, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

WORKER_ROOT = Path(__file__).resolve().parents[3]

ReasoningEffort = Literal["xhigh", "high", "medium", "low", "minimal", "none", ""]


class Settings(BaseSettings):
    openrouter_api_key: str
    coding_agent: str
    fallback_coding_agent: str = ""
    coding_agent_effort: ReasoningEffort = "medium"
    sandbox_provider: Literal["e2b"] = "e2b"
    e2b_api_key: str = ""
    e2b_template: str = "genie-web"
    supabase_url: str = ""
    supabase_secret_key: str = ""
    database_url: str = ""
    cloudflare_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    cloudflare_api_token: str = ""
    cloudflare_kv_namespace_id: str = ""
    proto_base_domain: str = "localhost:8787"

    model_config = SettingsConfigDict(
        env_file=WORKER_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


settings = Settings()
