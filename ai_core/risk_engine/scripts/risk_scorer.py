"""Phase-1 frame risk scoring for CrowdShield."""

from __future__ import annotations

import math
import sys
from collections import deque
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
    from ai_core.risk_engine.scripts.zone_adjacency import compute_zone_adjacency_map
except ImportError:
    from zone_adjacency import compute_zone_adjacency_map


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _centroid(bounds_normalized: dict[str, Any]) -> tuple[float, float]:
    x_min = _safe_float(bounds_normalized.get("x_min"))
    y_min = _safe_float(bounds_normalized.get("y_min"))
    x_max = _safe_float(bounds_normalized.get("x_max"))
    y_max = _safe_float(bounds_normalized.get("y_max"))
    return ((x_min + x_max) / 2.0, (y_min + y_max) / 2.0)


def _angle_difference_degrees(left: float, right: float) -> float:
    return abs((left - right + 180.0) % 360.0 - 180.0)


class RiskScorer:
    """Score phase-1 zone frames into a bounded risk level."""

    w_density = 0.35
    w_rate = 0.25
    w_convergence = 0.20
    w_bottleneck = 0.15
    w_anomaly = 0.05

    def __init__(self, history_maxlen: int = 20) -> None:
        if history_maxlen <= 0:
            raise ValueError("history_maxlen must be greater than zero.")
        self.history_maxlen = history_maxlen
        self._history_by_zone: dict[str, deque[dict[str, Any]]] = {}

    def _zone_history(self, zone_id: str) -> deque[dict[str, Any]]:
        if zone_id not in self._history_by_zone:
            self._history_by_zone[zone_id] = deque(maxlen=self.history_maxlen)
        return self._history_by_zone[zone_id]

    def compute_density_rate_of_change(
        self, zone_id: str, current_density: float
    ) -> float:
        """Return the average positive density increase over the stored history."""

        current_density = _clamp(_safe_float(current_density))
        history = self._zone_history(zone_id)
        previous_densities = [
            _clamp(_safe_float(entry.get("density_score")))
            for entry in history
            if "density_score" in entry
        ]

        if previous_densities:
            sequence = previous_densities + [current_density]
            positive_deltas = [
                max(sequence[index] - sequence[index - 1], 0.0)
                for index in range(1, len(sequence))
            ]
            rate = sum(positive_deltas) / len(positive_deltas)
        else:
            rate = 0.0

        history.append({"density_score": current_density})
        return _clamp(rate)

    def compute_flow_convergence(
        self,
        zone_id: str,
        all_zones_this_frame: list[dict[str, Any]],
        adjacency_map: dict[str, list[str]],
    ) -> float:
        """Measure whether neighboring flow vectors point toward the current zone."""

        zone_lookup = {
            str(zone.get("zone_id") or zone.get("id") or ""): zone
            for zone in all_zones_this_frame
            if isinstance(zone, dict)
        }
        current_zone = zone_lookup.get(zone_id)
        if not current_zone:
            return 0.0

        current_bounds = _safe_dict(current_zone.get("bounds_normalized"))
        if not current_bounds:
            return 0.0

        current_centroid = _centroid(current_bounds)
        neighbors = adjacency_map.get(zone_id, [])
        total_weight = 0.0
        inward_weight = 0.0

        for neighbor_id in neighbors:
            neighbor_zone = zone_lookup.get(neighbor_id)
            if not neighbor_zone:
                continue

            neighbor_bounds = _safe_dict(neighbor_zone.get("bounds_normalized"))
            if not neighbor_bounds:
                continue

            neighbor_speed = _clamp(_safe_float(neighbor_zone.get("avg_flow_speed")))
            if neighbor_speed <= 0.0:
                continue

            neighbor_centroid = _centroid(neighbor_bounds)
            dx = current_centroid[0] - neighbor_centroid[0]
            dy = current_centroid[1] - neighbor_centroid[1]
            # Compass bearing convention (0=N, 90=E, 180=S, 270=W) matching optical_flow.py
            target_angle = (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0
            neighbor_direction = (
                _safe_float(neighbor_zone.get("avg_flow_direction_deg")) % 360.0
            )
            inward = (
                1.0
                if _angle_difference_degrees(neighbor_direction, target_angle) <= 45.0
                else 0.0
            )

            total_weight += neighbor_speed
            inward_weight += neighbor_speed * inward

        if total_weight <= 0.0:
            return 0.0
        return _clamp(inward_weight / total_weight)

    def _risk_level(self, risk_score: float) -> str:
        if risk_score < 0.3:
            return "low"
        if risk_score < 0.55:
            return "moderate"
        if risk_score < 0.75:
            return "high"
        return "critical"

    def compute_risk_score(
        self,
        zone_frame_data: dict[str, Any],
        all_zones_this_frame: list[dict[str, Any]],
        adjacency_map: dict[str, list[str]],
    ) -> dict[str, Any]:
        zone_id = str(zone_frame_data.get("zone_id") or zone_frame_data.get("id") or "")
        density_score = _clamp(_safe_float(zone_frame_data.get("density_score")))
        density_rate_of_change = self.compute_density_rate_of_change(
            zone_id, density_score
        )
        flow_convergence_score = self.compute_flow_convergence(
            zone_id, all_zones_this_frame, adjacency_map
        )
        bottleneck_score = (
            1.0 if bool(zone_frame_data.get("bottleneck_detected", False)) else 0.0
        )
        anomaly_flags = zone_frame_data.get("anomaly_flags", [])
        anomaly_score = _clamp(
            len(anomaly_flags) / 3.0 if isinstance(anomaly_flags, list) else 0.0
        )

        weighted_density = self.w_density * density_score
        weighted_rate = self.w_rate * density_rate_of_change
        weighted_convergence = self.w_convergence * flow_convergence_score
        weighted_bottleneck = self.w_bottleneck * bottleneck_score
        weighted_anomaly = self.w_anomaly * anomaly_score

        risk_score = _clamp(
            weighted_density
            + weighted_rate
            + weighted_convergence
            + weighted_bottleneck
            + weighted_anomaly
        )

        return {
            "risk_score": risk_score,
            "risk_level": self._risk_level(risk_score),
            "contributing_factors": {
                "density_score": density_score,
                "density_rate_of_change": density_rate_of_change,
                "flow_convergence_score": flow_convergence_score,
                "bottleneck_score": bottleneck_score,
                "anomaly_score": anomaly_score,
                "weights": {
                    "density": self.w_density,
                    "rate": self.w_rate,
                    "convergence": self.w_convergence,
                    "bottleneck": self.w_bottleneck,
                    "anomaly": self.w_anomaly,
                },
                "weighted_components": {
                    "density": weighted_density,
                    "rate": weighted_rate,
                    "convergence": weighted_convergence,
                    "bottleneck": weighted_bottleneck,
                    "anomaly": weighted_anomaly,
                },
            },
        }

    def score_frame(self, frame_json: dict[str, Any]) -> dict[str, Any]:
        zones = frame_json.get("zones", [])
        adjacency_map = compute_zone_adjacency_map(zones)
        scored_zones = []

        for zone_frame_data in zones:
            if not isinstance(zone_frame_data, dict):
                continue
            zone_score = self.compute_risk_score(zone_frame_data, zones, adjacency_map)
            scored_zones.append(
                {
                    "zone_id": zone_frame_data.get("zone_id"),
                    "risk_score": zone_score["risk_score"],
                    "risk_level": zone_score["risk_level"],
                    "contributing_factors": zone_score["contributing_factors"],
                }
            )

        return {
            "timestamp": frame_json.get("timestamp"),
            "zones": scored_zones,
        }
