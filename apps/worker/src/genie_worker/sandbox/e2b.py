"""E2B implementation of Sandbox. The only worker module that imports e2b."""

import posixpath
import shlex
import uuid

import e2b

from genie_worker.sandbox.base import CommandResult, SandboxError

_PROJECT_ROOT = "/app"
_OUTPUT_TAIL_CHARS = 8000
_PACK_TIMEOUT_SECONDS = 120
# Same environment internal Genie runs pnpm with; template env vars only apply while it is built
_COMMAND_ENV = {
    "CI": "true",
    "NEXT_TELEMETRY_DISABLED": "1",
    "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
}


class E2BSandbox:
    def __init__(self, sandbox: e2b.Sandbox) -> None:
        self._sandbox = sandbox

    @classmethod
    def create(cls, *, template: str, api_key: str, lifetime_seconds: int) -> "E2BSandbox":
        try:
            sandbox = e2b.Sandbox.create(template, timeout=lifetime_seconds, api_key=api_key)
        except e2b.SandboxException as exc:
            raise SandboxError(f"Could not start E2B sandbox from {template}: {exc}") from exc
        return cls(sandbox)

    def list_files(self, path: str, skipped_dirs: frozenset[str]) -> list[str] | None:
        # One find call instead of one list request per directory
        prune = " -o ".join(f"-name {shlex.quote(name)}" for name in sorted(skipped_dirs))
        find = f"find {shlex.quote(path)} -mindepth 1"
        if prune:
            find += f" \\( {prune} \\) -prune -o"
        command = f"test -d {shlex.quote(path)} || exit 3; {find} -type f -print | sort"
        result = self._shell(command, timeout=60)
        if result.exit_code == 3:
            return None
        if not result.ok:
            raise SandboxError(f"Listing {path} failed: {result.output}")
        return [posixpath.normpath(line) for line in result.output.splitlines() if line]

    def read_bytes(self, path: str) -> bytes | None:
        try:
            if self._sandbox.files.get_info(self._abs(path)).type != e2b.FileType.FILE:
                return None
            return bytes(self._sandbox.files.read(self._abs(path), format="bytes"))
        except e2b.NotFoundException:
            return None

    def write_text(self, path: str, content: str) -> None:
        # E2B creates missing parent directories
        self._sandbox.files.write(self._abs(path), content)

    def delete_file(self, path: str) -> bool:
        try:
            if self._sandbox.files.get_info(self._abs(path)).type != e2b.FileType.FILE:
                return False
            self._sandbox.files.remove(self._abs(path))
        except e2b.NotFoundException:
            return False
        return True

    def pack(self, path: str, exclude: frozenset[str]) -> bytes:
        archive = f"/tmp/pack-{uuid.uuid4().hex}.tar.gz"
        excludes = " ".join(shlex.quote(f"--exclude=./{name}") for name in sorted(exclude))
        result = self._shell(
            f"tar -czf {archive} {excludes} -C {shlex.quote(path)} .", timeout=_PACK_TIMEOUT_SECONDS
        )
        if not result.ok:
            raise SandboxError(f"Packing {path} failed: {result.output}")
        try:
            return bytes(self._sandbox.files.read(archive, format="bytes"))
        finally:
            self._sandbox.files.remove(archive)

    def run(self, args: list[str], *, timeout: float) -> CommandResult:
        return self._shell(shlex.join(args), timeout=timeout)

    def close(self) -> None:
        self._sandbox.kill()

    def _shell(self, command: str, *, timeout: float) -> CommandResult:
        try:
            result = self._sandbox.commands.run(
                command, cwd=_PROJECT_ROOT, envs=_COMMAND_ENV, timeout=timeout
            )
            exit_code: int | None = result.exit_code
            output = result.stdout + result.stderr
        except e2b.CommandExitException as exc:
            exit_code, output = exc.exit_code, exc.stdout + exc.stderr
        except e2b.TimeoutException as exc:
            exit_code, output = None, str(exc)
        return CommandResult(exit_code=exit_code, output=output[-_OUTPUT_TAIL_CHARS:])

    @staticmethod
    def _abs(path: str) -> str:
        return posixpath.join(_PROJECT_ROOT, path)
