"""Prototype slugs: `{kebab-title}-{random}`, e.g. `habit-tracker-k3x9qa` (requirements section 10).

The slug is the prototype's subdomain, so it must be a valid DNS label: lower-case letters,
digits and hyphens, at most 63 characters. The random part keeps links unguessable (BR-10).
"""

import re
import secrets
import string
import unicodedata

_ALPHABET = string.ascii_lowercase + string.digits
_RANDOM_CHARS = 6
_MAX_TITLE_CHARS = 40
_FALLBACK = "prototype"


def make_slug(title: str | None) -> str:
    return f"{_kebab(title or '') or _FALLBACK}-{_random_part()}"


def _kebab(title: str) -> str:
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    words = re.findall(r"[a-z0-9]+", ascii_title.lower())
    slug = ""
    for word in words:
        candidate = f"{slug}-{word}" if slug else word
        if len(candidate) > _MAX_TITLE_CHARS:
            # A single over-long word is cut; otherwise stop at the last whole word
            return slug or word[:_MAX_TITLE_CHARS]
        slug = candidate
    return slug


def _random_part() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_RANDOM_CHARS))
