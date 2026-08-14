#!/usr/bin/env python3
"""
llm_client.py — CrowdShield GenAI Pipeline | Batch 1: Foundation LLM Abstraction Layer

Provides LLMClient, a thin, resilient wrapper around the Google Gemini API.
All downstream genai_pipeline scripts import from this module — it is the
ONLY place that touches the generative-AI SDK directly.

Key behaviours
--------------
* JSON-first:   generate_json() always returns a parsed dict; it drives Gemini's
                native JSON mode (response_mime_type="application/json") where the
                SDK supports it, and falls back to an explicit prompt instruction
                otherwise.
* JSON retry:   up to MAX_JSON_RETRIES re-prompts when the response is not valid
                JSON (catches hallucinated markdown fences, preamble, etc.).
* 429 backoff:  exponential back-off for rate-limit / service-unavailable errors
                so free-tier demos never crash (up to MAX_RATE_LIMIT_ATTEMPTS
                attempts: 2 s -> 4 s -> 8 s).
* Clean errors: every failure path raises LLMClientError so callers can apply
                their own fallback logic without catching broad exceptions.

Dependencies
------------
    pip install google-genai python-dotenv

Environment
-----------
Requires GEMINI_API_KEY in the environment (loaded automatically from the
nearest .env file up the directory tree via python-dotenv).
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Dependency imports — fail fast with a helpful message
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
except ImportError as _exc:
    raise ImportError(
        "python-dotenv is required. Install it with: pip install python-dotenv"
    ) from _exc

try:
    from google import genai
    from google.genai import types as genai_types
    from google.genai.errors import ClientError, ServerError
except ImportError as _exc:
    raise ImportError(
        "google-genai is required. Install it with: pip install google-genai"
    ) from _exc

# ---------------------------------------------------------------------------
# Load environment variables from the nearest .env file up the directory tree
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).resolve().parent
# Walk up: scripts/ -> genai_pipeline/ -> ai_core/ -> project root
for _candidate in [
    _THIS_DIR / ".env",
    _THIS_DIR.parent / ".env",
    _THIS_DIR.parent.parent / ".env",
    _THIS_DIR.parent.parent.parent / ".env",
]:
    if _candidate.exists():
        load_dotenv(_candidate)
        break
else:
    load_dotenv()  # fallback: let python-dotenv search CWD

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------
DEFAULT_MODEL: str = "gemini-3.6-flash"  # current recommended fast model
MAX_JSON_RETRIES: int = 2  # extra attempts after the first JSON failure
MAX_RATE_LIMIT_ATTEMPTS: int = 1  # total attempts before giving up on 429/503
BACKOFF_BASE_SECONDS: float = 2.0  # exponential back-off base (2 -> 4 -> 8 s)

# HTTP status codes we treat as rate-limit / transient errors
_RETRYABLE_HTTP_CODES: frozenset[int] = frozenset({429, 503, 500})

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------
class LLMClientError(Exception):
    """
    Raised by LLMClient for any unrecoverable error.

    Attributes
    ----------
    message : str
        Human-readable description of the failure.
    cause : Exception | None
        The underlying exception, if any.
    """

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.cause = cause

    def __str__(self) -> str:
        if self.cause:
            return (
                f"{self.message} (caused by: {type(self.cause).__name__}: {self.cause})"
            )
        return self.message


# ---------------------------------------------------------------------------
# LLMClient
# ---------------------------------------------------------------------------
class LLMClient:
    """
    Gemini-backed LLM client for the CrowdShield genai_pipeline.

    Parameters
    ----------
    model : str
        Gemini model name.  Defaults to ``DEFAULT_MODEL``.
    api_key : str | None
        Gemini API key.  If *None*, the value is read from the ``GEMINI_API_KEY``
        environment variable (loaded from .env automatically on module import).
    temperature : float
        Sampling temperature passed to the model.  Lower values are more
        deterministic.  Defaults to 0.2.

    Raises
    ------
    LLMClientError
        If ``GEMINI_API_KEY`` is not set.
    """

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        temperature: float = 0.2,
    ) -> None:
        resolved_key = api_key or os.getenv("GEMINI_API_KEY")
        if not resolved_key:
            raise LLMClientError(
                "GEMINI_API_KEY is not set. "
                "Add it to ai_core/genai_pipeline/.env (or the project root .env) "
                "and export GEMINI_API_KEY=<your-key>."
            )

        self._client = genai.Client(api_key=resolved_key)
        self._model_name = model
        self._temperature = temperature

        # Probe whether native JSON MIME mode is usable with the installed SDK
        self._supports_json_mime: bool = self._probe_json_mime_support()
        logger.debug(
            "LLMClient ready | model=%s | native_json_mode=%s | temperature=%.2f",
            self._model_name,
            self._supports_json_mime,
            self._temperature,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_json(self, prompt: str, schema_hint: str) -> dict[str, Any]:
        """
        Call Gemini and return the response as a parsed Python dict.

        The method guarantees one of two outcomes:
        * Returns a ``dict`` on success.
        * Raises ``LLMClientError`` when all retries are exhausted.

        Parameters
        ----------
        prompt : str
            The user-facing instruction / question for the model.
        schema_hint : str
            A short description of the expected JSON structure, e.g.
            ``"{'severity': int (1-5), 'summary': str}"``.
            Used to configure native JSON mode *and* as a prompt fallback.

        Returns
        -------
        dict
            Parsed JSON response from the model.

        Raises
        ------
        LLMClientError
            If the model returns invalid JSON after all retries, or if an
            unrecoverable API error occurs.
        """
        last_error: Exception | None = None

        for attempt in range(MAX_JSON_RETRIES + 1):
            augmented_prompt = self._build_prompt(prompt, schema_hint, attempt)
            raw_text = self._call_with_backoff(augmented_prompt)

            try:
                return self._parse_json(raw_text)
            except (json.JSONDecodeError, ValueError) as exc:
                last_error = exc
                logger.warning(
                    "JSON parse failure on attempt %d/%d: %s | raw=%r",
                    attempt + 1,
                    MAX_JSON_RETRIES + 1,
                    exc,
                    raw_text[:300],
                )
                # Next loop iteration will prefix the corrective instruction.

        raise LLMClientError(
            f"Model did not return valid JSON after {MAX_JSON_RETRIES + 1} attempt(s).",
            cause=last_error,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_prompt(self, prompt: str, schema_hint: str, attempt: int) -> str:
        """
        Construct the full prompt string sent to Gemini.

        * attempt == 0: JSON instruction appended once.
        * attempt  > 0: "Last response was not valid JSON" prefix added to
          pressure the model into compliance.
        """
        if self._supports_json_mime:
            # Native JSON mode handles the format; schema hint shapes the output.
            json_instruction = (
                f"Your response MUST conform to this JSON schema: {schema_hint}"
            )
        else:
            json_instruction = (
                "Respond ONLY with valid JSON matching this schema, "
                "no markdown fences, no preamble: "
                f"{schema_hint}"
            )

        base = f"{prompt}\n\n{json_instruction}"

        if attempt == 0:
            return base

        retry_prefix = (
            "Your last response was not valid JSON. "
            "Return ONLY the JSON object with no explanation, "
            "no markdown code fences, and no surrounding text.\n\n"
        )
        return retry_prefix + base

    def _call_with_backoff(self, prompt: str) -> str:
        """
        Send *prompt* to Gemini with exponential back-off for 429 / 503 errors.

        Returns
        -------
        str
            Raw text of the model's first candidate response.

        Raises
        ------
        LLMClientError
            After ``MAX_RATE_LIMIT_ATTEMPTS`` consecutive retryable errors, or
            on any non-retryable API error.
        """
        config = self._build_generation_config()

        for rate_attempt in range(1, MAX_RATE_LIMIT_ATTEMPTS + 1):
            try:
                response = self._client.models.generate_content(
                    model=self._model_name,
                    contents=prompt,
                    config=config,
                )

                # Surface empty / blocked responses early
                if not response.candidates:
                    raise LLMClientError(
                        "Gemini returned no candidates — the prompt may have been "
                        "blocked by safety filters."
                    )

                text: str = response.text
                if text is None:
                    raise LLMClientError(
                        "Gemini returned a candidate with no text content."
                    )
                return text

            except LLMClientError:
                raise  # never wrap our own errors

            except (ClientError, ServerError) as exc:
                # google.genai raises ClientError for 4xx and ServerError for 5xx.
                # Inspect the status code to decide whether to retry.
                status_code: int | None = getattr(exc, "status_code", None) or getattr(
                    exc, "code", None
                )
                is_retryable = (
                    status_code in _RETRYABLE_HTTP_CODES
                    or "quota" in str(exc).lower()
                    or "rate" in str(exc).lower()
                    or "unavailable" in str(exc).lower()
                )

                if not is_retryable or rate_attempt == MAX_RATE_LIMIT_ATTEMPTS:
                    raise LLMClientError(
                        f"Gemini API error (status={status_code}): {exc}",
                        cause=exc,
                    ) from exc

                wait = BACKOFF_BASE_SECONDS**rate_attempt  # 2 -> 4 -> 8 s
                logger.warning(
                    "Retryable API error (attempt %d/%d, status=%s). "
                    "Backing off %.1fs... | %s",
                    rate_attempt,
                    MAX_RATE_LIMIT_ATTEMPTS,
                    status_code,
                    wait,
                    exc,
                )
                time.sleep(wait)

            except Exception as exc:
                # Non-retryable — surface immediately
                raise LLMClientError(
                    f"Unexpected error during Gemini API call: {exc}",
                    cause=exc,
                ) from exc

        # Unreachable; satisfies type checkers
        raise LLMClientError(
            "Unexpected exit from rate-limit retry loop."
        )  # pragma: no cover

    def _build_generation_config(self) -> genai_types.GenerateContentConfig:
        """Return a GenerateContentConfig populated with our settings."""
        kwargs: dict[str, Any] = {"temperature": self._temperature}
        if self._supports_json_mime:
            kwargs["response_mime_type"] = "application/json"
        return genai_types.GenerateContentConfig(**kwargs)

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        """
        Parse *text* into a dict, stripping common model artefacts first.

        Handles:
        * Bare JSON objects
        * JSON wrapped in ```json ... ``` or ``` ... ``` fences
        * Leading / trailing whitespace
        """
        text = text.strip()

        # Strip markdown code fences if present (e.g. ```json ... ```)
        if text.startswith("```"):
            lines = text.splitlines()
            inner_lines = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
            text = "\n".join(inner_lines).strip()

        parsed = json.loads(text)  # raises json.JSONDecodeError on failure

        if not isinstance(parsed, dict):
            raise ValueError(
                f"Expected a JSON object (dict) but got {type(parsed).__name__}."
            )
        return parsed

    @staticmethod
    def _probe_json_mime_support() -> bool:
        """
        Return True if the installed google-genai SDK accepts
        ``response_mime_type`` in GenerateContentConfig.

        This is a lightweight introspection check — no network call is made.
        """
        try:
            cfg = genai_types.GenerateContentConfig(
                response_mime_type="application/json"
            )
            return getattr(cfg, "response_mime_type", None) == "application/json"
        except (TypeError, Exception):
            return False


# ---------------------------------------------------------------------------
# Standalone smoke test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%H:%M:%S",
    )

    print("=" * 60)
    print("  CrowdShield LLMClient -- smoke test")
    print("=" * 60)

    # ---- Initialise client ----
    try:
        client = LLMClient()
    except LLMClientError as err:
        print(f"\n[FAIL] Initialisation failed: {err}")
        sys.exit(1)

    print(f"\n  Model            : {client._model_name}")
    print(f"  Native JSON mode : {client._supports_json_mime}")
    print(f"  Temperature      : {client._temperature}")

    # ---- Trivial crowd-risk prompt ----
    SMOKE_PROMPT = (
        "You are a crowd-safety assistant. "
        "A zone has 150 people in a 100 m2 area. "
        "Assess the risk in one sentence and give a severity score from 1 (low) to 5 (critical)."
    )
    SMOKE_SCHEMA = "{'severity': int (1-5), 'summary': str, 'recommended_action': str}"

    print("\n  Calling generate_json ...\n")
    try:
        result = client.generate_json(SMOKE_PROMPT, SMOKE_SCHEMA)
        print("  [OK] Response received:\n")
        print(json.dumps(result, indent=4))
        print("\n  Smoke test PASSED")
    except LLMClientError as err:
        print(f"\n  [FAIL] generate_json failed: {err}")
        sys.exit(1)
