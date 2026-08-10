#!/usr/bin/env python3
"""
incident_summary.py — CrowdShield GenAI Pipeline | Batch 3: Post-Incident Summary Generator

Generates structured post-incident reports and executive summaries from historical
zone risk time-series data using LLMClient with a deterministic local fallback.
"""

from __future__ import annotations

import datetime
import logging
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
except ImportError:
    from .llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)


class IncidentSummaryGenerator:
    """
    Generates structured post-incident summaries for zone risk time-series data.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.client = llm_client or LLMClient()

    def generate_summary(
        self,
        zone_id: str,
        time_series_data: list[dict[str, Any]],
        resolution_status: str = "resolved",
        frame_interval_seconds: int = 30,
    ) -> dict[str, Any]:
        """
        Generate a post-incident summary from a sequence of historical risk frames.

        Parameters
        ----------
        zone_id : str
            ID of the target zone.
        time_series_data : list[dict]
            List of frame dicts (or zone risk dicts) in chronological order.
        resolution_status : str
            Current incident resolution status (default "resolved").
        frame_interval_seconds : int
            Assumed seconds per frame if timestamps are absent/unparseable (default 30).

        Returns
        -------
        dict
            Dict matching the specified incident summary schema.
        """
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if not time_series_data:
            return self._build_fallback(
                zone_id=zone_id,
                peak_risk_score=0.0,
                duration_at_risk_seconds=0,
                resolution_status=resolution_status,
                generated_at=now_iso,
                reason="No time-series data provided.",
            )

        # Pre-compute metrics from raw time-series data
        peak_risk_score = self._compute_peak_risk_score(time_series_data)
        duration_at_risk_seconds = self._compute_duration_at_risk(
            time_series_data, frame_interval_seconds=frame_interval_seconds
        )

        prompt = self._build_prompt(
            zone_id=zone_id,
            time_series_data=time_series_data,
            peak_risk_score=peak_risk_score,
            duration_seconds=duration_at_risk_seconds,
            resolution_status=resolution_status,
        )

        schema_hint = (
            '{"peak_risk_score": float, "duration_at_risk_seconds": int, '
            '"likely_cause": str, "narrative_summary": str}'
        )

        try:
            raw_response = self.client.generate_json(prompt, schema_hint)
            validated = self._validate_and_format_response(
                raw_response=raw_response,
                zone_id=zone_id,
                fallback_peak=peak_risk_score,
                fallback_duration=duration_at_risk_seconds,
                resolution_status=resolution_status,
                generated_at=now_iso,
            )
            return validated
        except Exception as exc:
            logger.warning(
                "LLM summary generation failed for zone %s: %s. Using local fallback.",
                zone_id,
                exc,
            )
            top_factor = self._identify_top_contributing_factor(time_series_data)
            return self._build_fallback(
                zone_id=zone_id,
                peak_risk_score=peak_risk_score,
                duration_at_risk_seconds=duration_at_risk_seconds,
                resolution_status=resolution_status,
                generated_at=now_iso,
                reason=f"Primary driver: {top_factor}.",
            )

    # ------------------------------------------------------------------
    # Pre-computation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_peak_risk_score(time_series_data: list[dict[str, Any]]) -> float:
        scores = []
        for item in time_series_data:
            score = item.get("risk_score")
            if score is not None and isinstance(score, (int, float)):
                scores.append(float(score))
        return round(max(scores), 4) if scores else 0.0

    @staticmethod
    def _compute_duration_at_risk(
        time_series_data: list[dict[str, Any]], frame_interval_seconds: int = 30
    ) -> int:
        at_risk_frames = []
        for item in time_series_data:
            risk_level = item.get("risk_level")
            risk_score = item.get("risk_score", 0.0)
            if risk_level in ("high", "critical") or (isinstance(risk_score, (int, float)) and risk_score >= 0.55):
                at_risk_frames.append(item)

        if not at_risk_frames:
            return 0

        # Attempt timestamp parsing if timestamps are available
        timestamps = []
        for item in at_risk_frames:
            ts_str = item.get("timestamp")
            if ts_str and isinstance(ts_str, str):
                try:
                    # Clean trailing Z for datetime parsing
                    clean_ts = ts_str.replace("Z", "+00:00")
                    dt = datetime.datetime.fromisoformat(clean_ts)
                    timestamps.append(dt)
                except ValueError:
                    pass

        if len(timestamps) >= 2:
            delta = (max(timestamps) - min(timestamps)).total_seconds()
            return int(delta) + frame_interval_seconds

        # Fallback to frame count multiplication
        return len(at_risk_frames) * frame_interval_seconds

    @staticmethod
    def _identify_top_contributing_factor(time_series_data: list[dict[str, Any]]) -> str:
        factor_totals: dict[str, float] = {}
        factor_counts: dict[str, int] = {}

        for item in time_series_data:
            factors = item.get("contributing_factors", {})
            if isinstance(factors, dict):
                for k, v in factors.items():
                    if isinstance(v, (int, float)):
                        factor_totals[k] = factor_totals.get(k, 0.0) + float(v)
                        factor_counts[k] = factor_counts.get(k, 0.0) + 1

        if not factor_totals:
            return "Elevated crowd density and bottleneck restrictions"

        averages = {k: factor_totals[k] / factor_counts[k] for k in factor_totals}
        top_k = max(averages, key=averages.get)
        clean_name = top_k.replace("_score", "").replace("_indicator", "").replace("_", " ")
        return f"high {clean_name}"

    def _build_prompt(
        self,
        zone_id: str,
        time_series_data: list[dict[str, Any]],
        peak_risk_score: float,
        duration_seconds: int,
        resolution_status: str,
    ) -> str:
        prompt_lines = [
            "You are an expert crowd safety analyst writing an executive post-incident summary.",
            f"Target Zone ID: {zone_id}",
            f"Incident Status: {resolution_status}",
            f"Calculated Peak Risk Score: {peak_risk_score}",
            f"Calculated Duration Above High Risk: {duration_seconds} seconds",
            "",
            "Chronological Risk Progression:",
        ]

        for idx, frame in enumerate(time_series_data, 1):
            ts = frame.get("timestamp", f"Frame {idx}")
            score = frame.get("risk_score", "N/A")
            level = frame.get("risk_level", "N/A")
            factors = frame.get("contributing_factors", {})
            factor_summary = ", ".join(
                f"{k}={v}" for k, v in factors.items() if isinstance(v, (int, float))
            )
            prompt_lines.append(f"  - [{ts}] risk_score={score}, risk_level={level} ({factor_summary})")

        prompt_lines.extend([
            "",
            "Instructions:",
            "1. Synthesize the likely root cause of the incident into a concise 1-2 sentence statement.",
            "2. Write a single-paragraph executive narrative summary detailing how the risk escalated, the peak impact, and the final resolution.",
            "3. Ensure output matches the requested JSON schema exactly.",
            "",
            'Return JSON: {"peak_risk_score": float, "duration_at_risk_seconds": int, "likely_cause": str, "narrative_summary": str}'
        ])

        return "\n".join(prompt_lines)

    def _validate_and_format_response(
        self,
        raw_response: dict[str, Any],
        zone_id: str,
        fallback_peak: float,
        fallback_duration: int,
        resolution_status: str,
        generated_at: str,
    ) -> dict[str, Any]:
        if not isinstance(raw_response, dict):
            raise ValueError("Response is not a dictionary.")

        peak = raw_response.get("peak_risk_score", fallback_peak)
        if not isinstance(peak, (int, float)):
            peak = fallback_peak

        duration = raw_response.get("duration_at_risk_seconds", fallback_duration)
        if not isinstance(duration, (int, float)):
            duration = fallback_duration

        likely_cause = str(raw_response.get("likely_cause", "")).strip()
        narrative_summary = str(raw_response.get("narrative_summary", "")).strip()

        if not likely_cause or not narrative_summary:
            raise ValueError("likely_cause and narrative_summary must be non-empty strings.")

        return {
            "zone_id": zone_id,
            "peak_risk_score": float(peak),
            "duration_at_risk_seconds": int(duration),
            "likely_cause": likely_cause,
            "narrative_summary": narrative_summary,
            "resolution_status": resolution_status,
            "generated_at": generated_at,
        }

    def _build_fallback(
        self,
        zone_id: str,
        peak_risk_score: float,
        duration_at_risk_seconds: int,
        resolution_status: str,
        generated_at: str,
        reason: str = "Elevated crowd density and bottleneck restrictions.",
    ) -> dict[str, Any]:
        narrative = (
            f"Zone {zone_id} reached a peak risk score of {peak_risk_score:.2f} with an elevated risk "
            f"duration of {duration_at_risk_seconds} seconds. The primary drivers were identified as "
            f"{reason.lower()} Current incident resolution status: {resolution_status}."
        )

        return {
            "zone_id": zone_id,
            "peak_risk_score": float(peak_risk_score),
            "duration_at_risk_seconds": int(duration_at_risk_seconds),
            "likely_cause": reason,
            "narrative_summary": narrative,
            "resolution_status": resolution_status,
            "generated_at": generated_at,
        }


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)

    print("=" * 60)
    print("  CrowdShield IncidentSummaryGenerator — Standalone Quick Check")
    print("=" * 60)

    sample_time_series = [
        {
            "timestamp": "2026-08-09T14:00:00Z",
            "zone_id": "zone_A1",
            "risk_score": 0.35,
            "risk_level": "moderate",
            "contributing_factors": {"density_score": 0.4, "flow_convergence_score": 0.2},
        },
        {
            "timestamp": "2026-08-09T14:00:30Z",
            "zone_id": "zone_A1",
            "risk_score": 0.65,
            "risk_level": "high",
            "contributing_factors": {"density_score": 0.7, "bottleneck_indicator": 1.0},
        },
        {
            "timestamp": "2026-08-09T14:01:00Z",
            "zone_id": "zone_A1",
            "risk_score": 0.92,
            "risk_level": "critical",
            "contributing_factors": {"density_score": 0.95, "flow_convergence_score": 0.9},
        },
    ]

    try:
        generator = IncidentSummaryGenerator()
        summary = generator.generate_summary("zone_A1", sample_time_series)
        print("\n  [OK] Summary generated:\n")
        print(json.dumps(summary, indent=2))
    except Exception as err:
        print(f"\n  [FAIL] Summary generation error: {err}")
