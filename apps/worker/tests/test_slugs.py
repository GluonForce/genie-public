import re

import pytest

from genie_worker.slugs import make_slug

# A valid DNS label: what a subdomain allows
DNS_LABEL = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


@pytest.mark.parametrize(
    ("title", "start"),
    [
        ("Habit tracker", "habit-tracker-"),
        ("  Café Menu — v2!  ", "cafe-menu-v2-"),
        ("To-Do List", "to-do-list-"),
        ("", "prototype-"),
        (None, "prototype-"),
        ("日本語", "prototype-"),
    ],
)
def test_slug_shape(title: str | None, start: str) -> None:
    slug = make_slug(title)
    assert slug.startswith(start)
    assert re.fullmatch(r"[a-z0-9]{6}", slug.removeprefix(start))
    assert DNS_LABEL.match(slug)


def test_long_titles_stop_at_a_whole_word() -> None:
    slug = make_slug("A very long prototype title that keeps going far beyond any limit")
    title_part = slug.rsplit("-", 1)[0]
    assert len(title_part) <= 40
    assert title_part == "a-very-long-prototype-title-that-keeps"


def test_one_long_word_is_cut() -> None:
    assert len(make_slug("x" * 80).rsplit("-", 1)[0]) == 40


def test_random_part_differs() -> None:
    assert len({make_slug("Same title") for _ in range(50)}) == 50
