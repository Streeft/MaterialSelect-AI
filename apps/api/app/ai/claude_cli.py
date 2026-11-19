"""Claude through the Claude Code CLI already installed on the machine.

This is the path for someone who has a Claude subscription and no API key: the
question is answered by the same ``claude`` binary the developer uses, with the
credentials it is already signed in with. Nothing different is sent — same
prompt, same JSON schema as ``claude-api`` — so from the service's point of view
the two are interchangeable.

The invocation is deliberately hostile to surprises. No shell. The problem
statement travels on **stdin**, never on the command line. Every tool is turned
off, ``--safe-mode`` keeps the machine's CLAUDE.md, skills, hooks, plugins and
MCP servers out of the request, sessions are not persisted, and the process runs
in a neutral working directory. This provider asks a question and reads an
answer; it must not become a way to run something.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess  # noqa: S404 - fixed argv, no shell, nothing untrusted in it
import tempfile
from pathlib import Path

from app.ai.model_base import CallLimits, ModelProviderBase, parse_json_object
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings

#: Generous characters per token for the size backstop: a JSON answer over this
#: many characters per allowed token is not one the ceiling let through.
_CHARS_PER_TOKEN_CAP = 8
#: The CLI's JSON envelope (usage, ids, cost) travels around the answer itself.
_ENVELOPE_ALLOWANCE = 8192


class ClaudeCLIProvider(ModelProviderBase):
    """Claude via ``claude -p``, authenticated as the local CLI already is."""

    name = "claude-cli"
    simulated = False

    def __init__(self, settings: Settings = default_settings) -> None:
        self.settings = settings

    @classmethod
    def from_settings(cls, settings: Settings) -> AIProvider:
        return cls(settings=settings)

    # --- transport --------------------------------------------------------

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        return self._run(system, user, schema, self.settings.ai_timeout_seconds)

    def _complete_limited(self, system: str, user: str, schema: dict, limits: CallLimits) -> dict:
        """One run under the short budget of the plan, the suggestions and the
        probe (D-247): their timeout, the CLI's output-token ceiling set for this
        process only, and a cap on the bytes read back. A single run, never a
        retry: the CLI already retries inside itself."""
        return self._run(
            system,
            user,
            schema,
            limits.timeout_seconds,
            max_output_tokens=limits.max_output_tokens,
        )

    def _run(
        self,
        system: str,
        user: str,
        schema: dict,
        timeout: float,
        *,
        max_output_tokens: int | None = None,
    ) -> dict:
        command = self._command(system, schema)
        env = os.environ.copy()
        if max_output_tokens is not None:
            env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = str(max_output_tokens)
        try:
            completed = subprocess.run(  # noqa: S603 - see the module docstring
                command,
                input=user,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                cwd=tempfile.gettempdir(),
                shell=False,
                check=False,
                env=env,
            )
        except subprocess.TimeoutExpired as exc:
            raise AIUnavailableError(
                f"O Claude Code não respondeu em {timeout:g}s. "
                "Aumente AI_TIMEOUT_SECONDS ou use AI_PROVIDER=mock."
            ) from exc
        except OSError as exc:
            raise AIUnavailableError(
                f"Não foi possível executar '{self.settings.ai_cli_command}': {exc}"
            ) from exc

        if completed.returncode != 0:
            raise AIUnavailableError(
                f"O Claude Code terminou com código {completed.returncode}: "
                f"{_first_line(completed.stderr) or 'sem mensagem de erro'}."
            )
        if (
            max_output_tokens is not None
            and len(completed.stdout)
            > max_output_tokens * _CHARS_PER_TOKEN_CAP + _ENVELOPE_ALLOWANCE
        ):
            # The ceiling above is the CLI's to honour; this is the backstop for a
            # version that does not, so a short call can never hand back a report.
            raise AIUnavailableError(
                "O Claude Code respondeu além do teto desta chamada "
                f"({max_output_tokens} tokens); a resposta foi descartada."
            )
        return _read_payload(completed.stdout)

    def _command(self, system: str, schema: dict) -> list[str]:
        executable = self._executable()
        command = [
            executable,
            "--print",
            "--output-format",
            "json",
            "--model",
            self.settings.ai_model or "claude-opus-5",
            "--system-prompt",
            system,
            "--json-schema",
            json.dumps(schema, ensure_ascii=False),
            # No tool may run: this call reads a statement and writes JSON.
            "--tools",
            "",
            "--disable-slash-commands",
            # Neither this machine's configuration nor its plugins get a say in
            # what the answer looks like.
            "--safe-mode",
            "--no-session-persistence",
        ]
        if Path(executable).suffix.lower() in {".cmd", ".bat"}:
            # npm installs a shim on Windows, and CreateProcess cannot run one.
            # Going through the interpreter is safe here precisely because the
            # argv above is fixed and the user's text arrives on stdin.
            command = [os.environ.get("COMSPEC", "cmd.exe"), "/c", *command]
        return command

    def _executable(self) -> str:
        name = self.settings.ai_cli_command.strip() or "claude"
        found = shutil.which(name)
        if found is None:
            raise AIUnavailableError(
                f"O executável '{name}' não foi encontrado no PATH. Instale o Claude "
                "Code, ajuste AI_CLI_COMMAND, ou use AI_PROVIDER=mock."
            )
        return found


def _read_payload(stdout: str) -> dict:
    """Pull the model's object out of the CLI's own JSON envelope."""
    envelope = parse_json_object(stdout)
    if envelope.get("is_error") or envelope.get("subtype") != "success":
        detail = (
            envelope.get("api_error_status") or envelope.get("result") or envelope.get("subtype")
        )
        raise AIUnavailableError(f"O Claude Code não completou a requisição: {detail}.")

    # The CLI validates the schema itself and hands back the parsed object; the
    # raw text is the fallback for a version that does not.
    structured = envelope.get("structured_output")
    if isinstance(structured, dict):
        return structured
    return parse_json_object(str(envelope.get("result", "")))


def _first_line(text: str | None) -> str:
    for line in (text or "").splitlines():
        if line.strip():
            return line.strip()[:300]
    return ""
