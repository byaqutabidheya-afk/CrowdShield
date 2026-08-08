"""Panic diffusion simulation for CrowdShield risk propagation."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
RISK_ENGINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = RISK_ENGINE_DIR.parent

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class PanicDiffusionModel:
    """Iteratively spread zone risk through the adjacency graph."""

    def simulate_steps(
        self,
        current_zone_risk_scores: dict[str, float],
        zone_crowd_counts: dict[str, int],
        adjacency_map: dict[str, list[str]],
        num_steps: int = 10,
        seconds_per_step: int = 30,
        diffusion_rate: float = 0.15,
        decay_rate: float = 0.05,
    ) -> list[dict[str, Any]]:
        zone_ids = list(current_zone_risk_scores.keys())
        current_scores = {
            zone_id: _clamp(_safe_float(current_zone_risk_scores.get(zone_id, 0.0)))
            for zone_id in zone_ids
        }
        steps: list[dict[str, Any]] = []

        for step_index in range(1, num_steps + 1):
            next_scores: dict[str, float] = {}

            for zone_id in zone_ids:
                crowd_count = int(zone_crowd_counts.get(zone_id, 0) or 0)
                neighbor_influence = 0.0

                if crowd_count > 0:
                    for neighbor_id in adjacency_map.get(zone_id, []):
                        neighbor_score = current_scores.get(neighbor_id, 0.0)
                        neighbor_influence += neighbor_score * diffusion_rate

                updated_score = (
                    current_scores.get(zone_id, 0.0) + neighbor_influence - decay_rate
                )
                next_scores[zone_id] = _clamp(updated_score)

            current_scores = next_scores
            steps.append(
                {
                    "step": step_index,
                    "time_offset_seconds": step_index * seconds_per_step,
                    "zone_risk_scores": dict(current_scores),
                }
            )

        return steps

    def predict_crush_timeline(
        self,
        simulated_steps: list[dict[str, Any]],
        critical_threshold: float = 0.75,
    ) -> list[dict[str, Any]]:
        if not simulated_steps:
            return []

        midpoint_index = len(simulated_steps) / 2.0
        initial_scores = simulated_steps[0].get("zone_risk_scores", {})
        zone_ids = set(initial_scores.keys())
        for step in simulated_steps:
            zone_ids.update(step.get("zone_risk_scores", {}).keys())

        predictions: list[dict[str, Any]] = []

        for zone_id in sorted(zone_ids):
            step_crossed: dict[str, Any] | None = None
            for step in simulated_steps:
                score = _safe_float(step.get("zone_risk_scores", {}).get(zone_id, 0.0))
                if score >= critical_threshold:
                    step_crossed = step
                    break

            if not step_crossed:
                continue

            initial_score = _safe_float(initial_scores.get(zone_id, 0.0))
            if initial_score > 0.6:
                confidence = "high"
            elif _safe_float(step_crossed.get("step", 0)) <= midpoint_index:
                confidence = "medium"
            else:
                confidence = "low"

            predictions.append(
                {
                    "zone_id": zone_id,
                    "predicted_critical_at_seconds": _safe_float(
                        step_crossed.get("time_offset_seconds", 0.0)
                    ),
                    "confidence": confidence,
                }
            )

        return predictions
