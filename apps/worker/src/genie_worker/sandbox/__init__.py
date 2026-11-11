from genie_worker.core.config import settings
from genie_worker.sandbox.base import CommandResult, Sandbox, SandboxError

__all__ = ["CommandResult", "Sandbox", "SandboxError", "open_sandbox"]

# FR-B8: a build never keeps a sandbox longer than 30 minutes
_LIFETIME_SECONDS = 30 * 60


def open_sandbox() -> Sandbox:
    """Start a fresh sandbox with the scaffolded template, from the configured provider."""

    if settings.sandbox_provider == "e2b":
        # Imported here so other providers never need the e2b package
        from genie_worker.sandbox.e2b import E2BSandbox

        return E2BSandbox.create(
            template=settings.e2b_template,
            api_key=settings.e2b_api_key,
            lifetime_seconds=_LIFETIME_SECONDS,
        )
    raise SandboxError(f"Unknown SANDBOX_PROVIDER {settings.sandbox_provider!r}")
