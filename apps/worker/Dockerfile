# Genie v2 build worker. Railway: service root directory apps/worker, no public port.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first, so code changes don't reinstall them
COPY pyproject.toml uv.lock .python-version README.md ./
RUN uv sync --locked --no-dev --no-install-project

COPY src ./src
COPY examples ./examples
RUN uv sync --locked --no-dev

RUN useradd --create-home worker
USER worker

# Run the entry point directly so it receives Railway's SIGTERM and requeues a running build
CMD ["genie-worker"]
