"""Offline pre-event crowd buildup simulator for CrowdShield."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
RISK_ENGINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = RISK_ENGINE_DIR.parent

if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))
if str(RISK_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

try:
    from ai_core.risk_engine.scripts.panic_diffusion import PanicDiffusionModel
except ImportError:
    from panic_diffusion import PanicDiffusionModel


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _zone_to_dict(zone: Any) -> dict[str, Any]:
    if hasattr(zone, "to_dict"):
        return dict(zone.to_dict())
    if isinstance(zone, dict):
        return dict(zone)
    raise TypeError("zones must be dictionaries or Zone-like objects.")


def _max_expected_count(zone_data: dict[str, Any]) -> int:
    return max(1, _safe_int(zone_data.get("max_expected_count", 50), 50))


def _density_from_count(crowd_count: int, max_expected_count: int) -> float:
    if crowd_count <= 0:
        return 0.0
    return _clamp(crowd_count / float(max_expected_count))


def _distribute_arrivals(
    start_zone_id: str,
    people_to_add: int,
    zone_records: dict[str, dict[str, Any]],
    adjacency_map: dict[str, list[str]],
) -> None:
    """Distribute arriving people into start_zone_id, overflowing into adjacent zones as capacity fills."""
    queue = [start_zone_id]
    visited: set[str] = set()
    remaining_people = people_to_add

    while remaining_people > 0 and queue:
        current_id = queue.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)

        zone_data = zone_records[current_id]
        max_cap = _max_expected_count(zone_data)
        current_count = _safe_int(zone_data.get("crowd_count", 0), 0)
        available = max(0, max_cap - current_count)

        if available > 0:
            assigned = min(remaining_people, available)
            zone_data["crowd_count"] = current_count + assigned
            remaining_people -= assigned

        if remaining_people > 0:
            for nbr in adjacency_map.get(current_id, []):
                if nbr in zone_records and nbr not in visited:
                    queue.append(nbr)

    if remaining_people > 0:
        zone_records[start_zone_id]["crowd_count"] += remaining_people


class PreEventSimulator:
    """Simulate offline arrival buildup and congestion diffusion."""

    def __init__(self) -> None:
        self._diffuser = PanicDiffusionModel()

    def simulate_arrival_buildup(
        self,
        zones: list[Any],
        entry_zone_ids: list[str],
        expected_attendance: int,
        adjacency_map: dict[str, list[str]],
        arrival_duration_minutes: int = 30,
        num_steps: int = 20,
    ) -> list[dict[str, Any]]:
        if num_steps <= 0:
            raise ValueError("num_steps must be greater than zero.")
        if arrival_duration_minutes <= 0:
            raise ValueError("arrival_duration_minutes must be greater than zero.")
        if expected_attendance < 0:
            raise ValueError("expected_attendance must be non-negative.")

        zone_records = {
            _zone_to_dict(zone)["zone_id"]: _zone_to_dict(zone) for zone in zones
        }
        for zone_id, zone_data in zone_records.items():
            zone_data["crowd_count"] = _safe_int(zone_data.get("crowd_count", 0), 0)
            zone_data["density_score"] = _density_from_count(
                zone_data["crowd_count"], _max_expected_count(zone_data)
            )

        entry_zone_ids = [
            zone_id for zone_id in entry_zone_ids if zone_id in zone_records
        ]
        current_risk_scores = {
            zone_id: _clamp(_safe_float(zone_data.get("density_score", 0.0)))
            for zone_id, zone_data in zone_records.items()
        }
        snapshots: list[dict[str, Any]] = []
        previous_cumulative_arrivals = 0
        seconds_per_step = int(round(arrival_duration_minutes * 60 / num_steps))

        for step_index in range(1, num_steps + 1):
            cumulative_arrivals = round(expected_attendance * step_index / num_steps)
            arrivals_this_step = int(cumulative_arrivals - previous_cumulative_arrivals)
            previous_cumulative_arrivals = int(cumulative_arrivals)

            if entry_zone_ids and arrivals_this_step > 0:
                base_share, remainder = divmod(arrivals_this_step, len(entry_zone_ids))
                for entry_index, entry_zone_id in enumerate(entry_zone_ids):
                    added_people = base_share + (1 if entry_index < remainder else 0)
                    _distribute_arrivals(
                        entry_zone_id, added_people, zone_records, adjacency_map
                    )

            for zone_id, zone_data in zone_records.items():
                zone_data["density_score"] = _density_from_count(
                    _safe_int(zone_data.get("crowd_count", 0), 0),
                    _max_expected_count(zone_data),
                )

            base_risk_scores = {
                zone_id: max(
                    current_risk_scores.get(zone_id, 0.0),
                    _safe_float(zone_data.get("density_score", 0.0)),
                )
                for zone_id, zone_data in zone_records.items()
            }

            diffusion_step = self._diffuser.simulate_steps(
                current_zone_risk_scores=base_risk_scores,
                zone_crowd_counts={
                    zone_id: _safe_int(zone_data.get("crowd_count", 0), 0)
                    for zone_id, zone_data in zone_records.items()
                },
                adjacency_map=adjacency_map,
                num_steps=1,
                seconds_per_step=seconds_per_step,
            )[0]

            diffusion_step["step"] = step_index
            diffusion_step["time_offset_seconds"] = step_index * seconds_per_step
            # Preserve the arrival-buildup measurements alongside the diffused
            # risk scores so consumers can explain what drives each step.
            diffusion_step["zone_crowd_counts"] = {
                zone_id: _safe_int(zone_data.get("crowd_count", 0), 0)
                for zone_id, zone_data in zone_records.items()
            }
            diffusion_step["zone_density_scores"] = {
                zone_id: _safe_float(zone_data.get("density_score", 0.0))
                for zone_id, zone_data in zone_records.items()
            }
            diffusion_step["zones"] = [
                {
                    "zone_id": zone_id,
                    "risk_score": _safe_float(diffusion_step["zone_risk_scores"].get(zone_id)),
                    "crowd_count": diffusion_step["zone_crowd_counts"].get(zone_id, 0),
                    "density_score": diffusion_step["zone_density_scores"].get(zone_id, 0.0),
                }
                for zone_id in zone_records
            ]
            current_risk_scores = dict(diffusion_step["zone_risk_scores"])
            snapshots.append(diffusion_step)

        return snapshots

    def flag_bottleneck_risks(
        self, steps: list[dict[str, Any]], threshold: float = 0.7
    ) -> list[dict[str, Any]]:
        if not steps:
            return []

        first_crossings: dict[str, dict[str, Any]] = {}

        for step in steps:
            zone_scores = step.get("zone_risk_scores", {})
            for zone_id, risk_score in zone_scores.items():
                if _safe_float(risk_score) < threshold or zone_id in first_crossings:
                    continue
                first_crossings[zone_id] = {
                    "zone_id": zone_id,
                    "predicted_bottleneck_at_seconds": _safe_float(
                        step.get("time_offset_seconds", 0.0)
                    ),
                    "step": _safe_int(step.get("step", 0), 0),
                    "risk_score": _clamp(_safe_float(risk_score)),
                }

        return [first_crossings[zone_id] for zone_id in sorted(first_crossings)]
