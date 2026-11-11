"""Build the `genie-web` E2B template: internal Genie's web template, static export, deps installed.

Run from the repo root: uv run --project apps/worker python infra/e2b-template/build.py
On Windows set PYTHONIOENCODING=utf-8 first; build logs contain characters cp1252 can't print.
"""

from pathlib import Path

from e2b import Template
from genie_worker.core.config import settings

TEMPLATE_NAME = "genie-web"

template = (
    Template(file_context_path=Path(__file__).resolve().parent)
    .from_node_image("22")
    .set_user("root")
    .run_cmd("corepack enable && mkdir -p /app && chown user:user /app")
    .set_user("user")
    .set_envs(
        {
            # Same environment internal Genie runs pnpm with (prototype_service._pnpm_env)
            "CI": "true",
            "NEXT_TELEMETRY_DISABLED": "1",
            "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
        }
    )
    .copy("web", "/app", user="user")
    .set_workdir("/app")
    # Same install as internal scaffold_prototype
    .run_cmd("pnpm install --frozen-lockfile")
)

if __name__ == "__main__":
    info = Template.build(
        template,
        TEMPLATE_NAME,
        cpu_count=2,
        memory_mb=4096,
        api_key=settings.e2b_api_key,
        on_build_logs=lambda entry: print(entry),
    )
    print(info)
