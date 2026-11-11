from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

_GENIE_DIR = Path(__file__).resolve().parents[1]
_CONTEXT_DIR = _GENIE_DIR / "agents" / "context"


class Platform(StrEnum):
    WEB = "web"


@dataclass(frozen=True)
class PlatformProfile:
    """Everything that differs between the kinds of prototype Genie can build."""

    platform: Platform
    generation_context: Path
    skipped_dirs: frozenset[str]
    pnpm_usage: str
    generating_instructions: str


WEB = PlatformProfile(
    platform=Platform.WEB,
    generation_context=_CONTEXT_DIR / "web" / "code_generation.txt",
    skipped_dirs=frozenset({"node_modules", ".next", ".git", ".turbo", "out"}),
    pnpm_usage="`lint`, `build`, `add` and `exec tsc|eslint|next`",
    generating_instructions="""
- Example paths: `src/app/page.tsx` or `src/lib/storage.ts`.
- Do not use `create-next-app`, `shadcn init` or any other scaffolder. Dependencies are already installed; run `pnpm add` only for a package that is genuinely missing.
- Do not change `next.config.ts`: its static export settings are required to publish the prototype.
""".strip(),
)

PROFILES = {profile.platform: profile for profile in (WEB,)}
