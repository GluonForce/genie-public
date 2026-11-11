import logging
from functools import cache

import httpx
from pydantic_ai.exceptions import FallbackExceptionGroup, ModelAPIError
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openrouter import OpenRouterModel, OpenRouterModelSettings
from pydantic_ai.providers.openrouter import OpenRouterProvider

from genie_worker.core.config import ReasoningEffort, settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
_PREFIX = "openrouter:"
_TIMEOUT_SECONDS = 60.0


def openrouter_model_id(model_id: str) -> str:
    return model_id.strip().removeprefix(_PREFIX)


def model_chain(model_id: str, fallback_id: str = "") -> list[str]:
    """The primary model id followed by the fallback, if one is configured."""

    return [openrouter_model_id(model) for model in (model_id, fallback_id) if model.strip()]


@cache
def openrouter_provider() -> OpenRouterProvider:
    return OpenRouterProvider(api_key=settings.openrouter_api_key)


def openrouter_model(model_id: str) -> OpenRouterModel:
    """Chat model for agent features. Accepts `provider/model` or `openrouter:provider/model`."""

    return OpenRouterModel(openrouter_model_id(model_id), provider=openrouter_provider())


def agent_model(model_id: str, fallback_id: str = "") -> Model:
    """Chat model for an agent. With a fallback, any request the primary model fails is sent to the fallback."""

    models = [openrouter_model(model) for model in model_chain(model_id, fallback_id)]
    if len(models) == 1:
        return models[0]
    return FallbackModel(*models, fallback_on=_log_model_failure)


def reasoning_settings(effort: ReasoningEffort) -> OpenRouterModelSettings | None:
    """Reasoning effort for a run. An empty effort leaves it to each model's default."""

    if not effort:
        return None
    return OpenRouterModelSettings(openrouter_reasoning={"effort": effort})


def log_agent_start(agent: str, model_id: str, fallback_id: str, effort: ReasoningEffort) -> None:
    logger.info(
        "%s agent starting: model=%s effort=%s fallback=%s",
        agent,
        openrouter_model_id(model_id),
        effort or "model default",
        openrouter_model_id(fallback_id) or "none",
    )


def log_agent_finish(agent: str, model_name: str | None) -> None:
    logger.info("%s agent finished: answered by %s", agent, model_name or "unknown model")


def fallback_failure_message(exc: FallbackExceptionGroup) -> str:
    """One line naming every model that failed and why."""

    return "; ".join(
        f"{error.model_name}: {error.message}" if isinstance(error, ModelAPIError) else str(error)
        for error in exc.exceptions
    )


def _log_model_failure(exc: Exception) -> bool:
    if not isinstance(exc, ModelAPIError):
        return False
    logger.warning("Model %s failed: %s", exc.model_name, exc.message)
    return True


@cache
def openrouter_client() -> httpx.AsyncClient:
    """Shared HTTP client for OpenRouter endpoints that are outside chat completions."""

    return httpx.AsyncClient(
        base_url=OPENROUTER_BASE_URL,
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
        timeout=_TIMEOUT_SECONDS,
    )


async def close_openrouter_client() -> None:
    if openrouter_client.cache_info().currsize == 0:
        return
    await openrouter_client().aclose()
    openrouter_client.cache_clear()
