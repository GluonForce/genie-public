import os

# Settings need these; CI has no .env, and tests must never use the real keys
os.environ.setdefault("OPENROUTER_API_KEY", "test")
os.environ.setdefault("CODING_AGENT", "test/model")
