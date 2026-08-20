#!/usr/bin/env python3
"""Groq-backed LLM abstraction for the CrowdShield GenAI pipeline."""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError as exc:
    raise ImportError(
        "python-dotenv is required. Install it with: pip install python-dotenv"
    ) from exc

try:
    from openai import OpenAI
except ImportError as exc:
    raise ImportError(
        "openai is required. Install it with: pip install openai"
    ) from exc


_THIS_DIR = Path(__file__).resolve().parent
for _candidate in (
    _THIS_DIR / ".env",
    _THIS_DIR.parent / ".env",
    _THIS_DIR.parent.parent / ".env",
    _THIS_DIR.parent.parent.parent / ".env",
):
    if _candidate.exists():
        load_dotenv(_candidate)
        break
else:
    load_dotenv()


DEFAULT_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
MAX_JSON_RETRIES: int = 1
MAX_RATE_LIMIT_ATTEMPTS: int = 2
BACKOFF_BASE_SECONDS: float = 2.0

logger = logging.getLogger(__name__)


class LLMClientError(Exception):
    """Raised when the LLM request or response cannot be used."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.cause = cause

    def __str__(self) -> str:
        if self.cause:
            return (
                f"{self.message} (caused by: {type(self.cause).__name__}: "
                f"{self.cause})"
            )
        return self.message


class LLMClient:
    """Groq client with the interface used by the existing pipeline."""

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        temperature: float = 0.2,
    ) -> None:
        resolved_key = api_key or os.getenv("GROQ_API_KEY")
        if not resolved_key:
            raise LLMClientError(
                "GROQ_API_KEY is not set. Add it to the project .env file."
            )

        self._client = OpenAI(
            api_key=resolved_key,
            base_url="https://api.groq.com/openai/v1",
        )
        self._model_name = model
        self._temperature = temperature
        self._request_count = 0

        logger.debug(
            "LLMClient ready | provider=Groq | model=%s | temperature=%.2f",
            self._model_name,
            self._temperature,
        )

    def generate_json(self, prompt: str, schema_hint: str) -> dict[str, Any]:
        """Generate and parse one JSON object."""
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

        raise LLMClientError(
            f"Model did not return valid JSON after {MAX_JSON_RETRIES + 1} attempt(s).",
            cause=last_error,
        )

    @staticmethod
    def _build_prompt(prompt: str, schema_hint: str, attempt: int) -> str:
        json_instruction = (
            "Respond ONLY with one valid JSON object matching this schema. "
            "Do not use markdown fences or add explanatory text:\n"
            f"{schema_hint}"
        )
        base = f"{prompt}\n\n{json_instruction}"

        if attempt == 0:
            return base

        return (
            "Your previous answer was invalid JSON. Return only a valid JSON object."
            "\n\n"
            + base
        )

    def _call_with_backoff(self, prompt: str) -> str:
        """Call Groq with bounded exponential backoff."""
        for rate_attempt in range(1, MAX_RATE_LIMIT_ATTEMPTS + 1):
            try:
                self._request_count += 1
                logger.info(
                    "LLM request #%d | provider=Groq | model=%s",
                    self._request_count,
                    self._model_name,
                )

                response = self._client.chat.completions.create(
                    model=self._model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are CrowdShield, a precise crowd-safety "
                                "and emergency-response assistant."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=self._temperature,
                    response_format={"type": "json_object"},
                    max_completion_tokens=1200,
                )

                if not response.choices:
                    raise LLMClientError("Groq returned no completion choices.")

                content = response.choices[0].message.content
                if not content:
                    raise LLMClientError("Groq returned an empty response.")
                return content

            except LLMClientError:
                raise
            except Exception as exc:
                status_code = getattr(exc, "status_code", None) or getattr(
                    exc, "code", None
                )
                is_retryable = (
                    status_code in {429, 500, 502, 503, 504}
                    or "rate limit" in str(exc).lower()
                    or "temporarily unavailable" in str(exc).lower()
                )

                if not is_retryable or rate_attempt == MAX_RATE_LIMIT_ATTEMPTS:
                    raise LLMClientError(
                        f"Groq API error (status={status_code}): {exc}",
                        cause=exc,
                    ) from exc

                wait = BACKOFF_BASE_SECONDS**rate_attempt
                logger.warning(
                    "Retryable Groq error (attempt %d/%d, status=%s). "
                    "Backing off %.1fs: %s",
                    rate_attempt,
                    MAX_RATE_LIMIT_ATTEMPTS,
                    status_code,
                    wait,
                    exc,
                )
                time.sleep(wait)

        raise LLMClientError("Unexpected exit from Groq retry loop.")

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        text = text.strip()

        if text.startswith("```"):
            lines = text.splitlines()
            inner_lines = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
            text = "\n".join(inner_lines).strip()

        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError(
                f"Expected a JSON object (dict) but got {type(parsed).__name__}."
            )
        return parsed


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)
    try:
        client = LLMClient()
        result = client.generate_json(
            "Assess a zone with rising crowd density.",
            '{"severity": integer, "summary": string, "recommended_action": string}',
        )
        print(json.dumps(result, indent=2))
    except LLMClientError as err:
        print(f"[FAIL] {err}")
        sys.exit(1)
