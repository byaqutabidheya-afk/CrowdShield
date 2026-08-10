"""Geometry-based zone adjacency helpers for the risk engine."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Mapping

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
    from ai_core.shared.zone_config import Zone
except ImportError:
    from shared.zone_config import Zone


def _zone_bounds(zone: Zone | Mapping[str, Any]) -> tuple[str, dict[str, float]]:
    if isinstance(zone, Zone):
        zone_id = zone.zone_id
        bounds = zone.bounds_normalized
    else:
        zone_id = str(zone.get("zone_id") or zone.get("id") or "")
        bounds = zone.get("bounds_normalized", {})

    if not zone_id:
        raise ValueError("Each zone must include a zone_id.")

    required_keys = ("x_min", "y_min", "x_max", "y_max")
    if not bounds or any(key not in bounds for key in required_keys):
        raise ValueError(f"Zone {zone_id} is missing bounds_normalized coordinates.")

    normalized_bounds = {key: float(bounds[key]) for key in required_keys}
    return zone_id, normalized_bounds


def _interval_overlap(min_a: float, max_a: float, min_b: float, max_b: float) -> float:
    return max(0.0, min(max_a, max_b) - max(min_a, min_b))


def compute_zone_adjacency_map(
    zones: list[Zone | Mapping[str, Any]],
) -> dict[str, list[str]]:
    """Compute orthogonal adjacency from normalized bounds only.

    Two zones are adjacent when they share a full edge segment with positive
    overlap on the perpendicular axis. Corner touches are not considered
    adjacency.
    """

    parsed_zones = [_zone_bounds(zone) for zone in zones]
    adjacency_map: dict[str, set[str]] = {zone_id: set() for zone_id, _ in parsed_zones}
    tolerance = 1e-6

    for index, (zone_id_a, bounds_a) in enumerate(parsed_zones):
        for zone_id_b, bounds_b in parsed_zones[index + 1 :]:
            horizontal_overlap = _interval_overlap(
                bounds_a["x_min"],
                bounds_a["x_max"],
                bounds_b["x_min"],
                bounds_b["x_max"],
            )
            vertical_overlap = _interval_overlap(
                bounds_a["y_min"],
                bounds_a["y_max"],
                bounds_b["y_min"],
                bounds_b["y_max"],
            )

            touches_vertically = horizontal_overlap > 0.0 and (
                abs(bounds_a["y_max"] - bounds_b["y_min"]) <= tolerance
                or abs(bounds_b["y_max"] - bounds_a["y_min"]) <= tolerance
            )
            touches_horizontally = vertical_overlap > 0.0 and (
                abs(bounds_a["x_max"] - bounds_b["x_min"]) <= tolerance
                or abs(bounds_b["x_max"] - bounds_a["x_min"]) <= tolerance
            )

            if touches_vertically or touches_horizontally:
                adjacency_map[zone_id_a].add(zone_id_b)
                adjacency_map[zone_id_b].add(zone_id_a)

    return {zone_id: sorted(neighbors) for zone_id, neighbors in adjacency_map.items()}
