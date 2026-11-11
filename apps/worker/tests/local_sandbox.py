import io
import tarfile
from pathlib import Path

from genie_worker.sandbox import CommandResult


class LocalSandbox:
    """Sandbox backed by a temporary folder; commands are recorded, not run.

    Commands answer with exit code 0 unless results are queued for them in `scripted`.
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        self.commands: list[list[str]] = []
        self.scripted: dict[str, list[CommandResult]] = {}

    def list_files(self, path: str, skipped_dirs: frozenset[str]) -> list[str] | None:
        base = self.root / path
        if not base.is_dir():
            return None
        return sorted(
            file.relative_to(self.root).as_posix()
            for file in base.rglob("*")
            if file.is_file() and not skipped_dirs.intersection(file.relative_to(self.root).parts)
        )

    def read_bytes(self, path: str) -> bytes | None:
        file = self.root / path
        return file.read_bytes() if file.is_file() else None

    def write_text(self, path: str, content: str) -> None:
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8", newline="\n")

    def delete_file(self, path: str) -> bool:
        file = self.root / path
        if not file.is_file():
            return False
        file.unlink()
        return True

    def pack(self, path: str, exclude: frozenset[str]) -> bytes:
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            for entry in sorted((self.root / path).iterdir()):
                if entry.name not in exclude:
                    archive.add(entry, arcname=f"./{entry.name}")
        return buffer.getvalue()

    def run(self, args: list[str], *, timeout: float) -> CommandResult:
        self.commands.append(args)
        queued = self.scripted.get(" ".join(args))
        if queued:
            return queued.pop(0)
        return CommandResult(exit_code=0, output="ok")

    def close(self) -> None:
        pass
