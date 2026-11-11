from dataclasses import dataclass
from typing import Protocol


class SandboxError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class CommandResult:
    exit_code: int | None
    output: str

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


class Sandbox(Protocol):
    """Where the prototype is built. Paths are relative to the project root and already checked.

    The coding agent only talks to this interface, so the provider (E2B today) can be swapped by
    adding another implementation in this package.
    """

    def list_files(self, path: str, skipped_dirs: frozenset[str]) -> list[str] | None:
        """Files under path, recursively and sorted, relative to the project root. None if not a
        directory."""
        ...

    def read_bytes(self, path: str) -> bytes | None:
        """The file's content, or None if it is not a file."""
        ...

    def write_text(self, path: str, content: str) -> None:
        """Create or overwrite a file, creating missing parent directories."""
        ...

    def delete_file(self, path: str) -> bool:
        """Delete a file. False if it is not a file."""
        ...

    def pack(self, path: str, exclude: frozenset[str]) -> bytes:
        """A .tar.gz of the directory at path, leaving out these top-level names."""
        ...

    def run(self, args: list[str], *, timeout: float) -> CommandResult:
        """Run a command in the project root. exit_code is None when it timed out."""
        ...

    def close(self) -> None: ...
