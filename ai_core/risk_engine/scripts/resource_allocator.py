"""Resource allocation suggestions for CrowdShield risk hotspots."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
RISK_ENGINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = RISK_ENGINE_DIR.parent

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


class ResourceAllocator:
    """Suggest tactical resources based on scored zone risk."""

    def suggest_allocations(
        self,
        scored_zones: list[dict[str, Any]],
        adjacency_map: dict[str, list[str]],
        historical_incident_zones: list[str] | None = None,
        top_n: int = 3,
    ) -> list[dict[str, Any]]:
        historical_set = set(historical_incident_zones or [])
        candidates: list[tuple[float, str, dict[str, Any]]] = []

        for zone in scored_zones:
            zone_id = str(zone.get("zone_id") or zone.get("id") or "")
            if not zone_id:
                continue

            effective_rank = _safe_float(zone.get("risk_score"))
            if zone_id in historical_set:
                effective_rank += 0.1
            candidates.append((effective_rank, zone_id, zone))

        candidates.sort(key=lambda item: (-item[0], item[1]))
        selected_zone_ids: list[str] = []

        for _, zone_id, _ in candidates[: max(0, top_n)]:
            if zone_id not in selected_zone_ids:
                selected_zone_ids.append(zone_id)

        for zone_id in historical_set:
            if zone_id not in selected_zone_ids and any(
                candidate[1] == zone_id for candidate in candidates
            ):
                selected_zone_ids.append(zone_id)

        candidate_lookup = {zone_id: zone for _, zone_id, zone in candidates}
        ordered_selected = [
            candidate_lookup[zone_id]
            for zone_id in selected_zone_ids
            if zone_id in candidate_lookup
        ]

        suggestions: list[dict[str, Any]] = []
        for zone in ordered_selected:
            zone_id = str(zone.get("zone_id") or zone.get("id") or "")
            factors = _safe_dict(zone.get("contributing_factors"))
            if not factors:
                factors = {
                    "density_score": _safe_float(zone.get("risk_score")),
                    "density_rate_of_change": 0.0,
                    "flow_convergence_score": 0.0,
                    "bottleneck_score": 0.0,
                    "anomaly_score": 0.0,
                }

            if zone_id in historical_set:
                suggestion_type = "medical_tent"
            else:
                suggestion_type = self._suggestion_type_from_factors(factors)

            dominant_factor_name, dominant_factor_value = self._dominant_factor(factors)
            reason = self._reason_for_suggestion(
                zone_id=zone_id,
                suggestion_type=suggestion_type,
                dominant_factor_name=dominant_factor_name,
                dominant_factor_value=dominant_factor_value,
                historical=zone_id in historical_set,
            )

            priority = (
                "high"
                if _safe_float(zone.get("risk_score")) >= 0.55
                or zone_id not in historical_set
                else "medium"
            )
            suggestions.append(
                {
                    "zone_id": zone_id,
                    "suggestion_type": suggestion_type,
                    "reason": reason,
                    "priority": priority,
                }
            )

        return suggestions

    def _dominant_factor(self, factors: dict[str, Any]) -> tuple[str, float]:
        factor_values = {
            "density_score": _safe_float(factors.get("density_score")),
            "density_rate_of_change": _safe_float(
                factors.get("density_rate_of_change")
            ),
            "flow_convergence_score": _safe_float(
                factors.get("flow_convergence_score")
            ),
            "bottleneck_score": _safe_float(factors.get("bottleneck_score")),
            "anomaly_score": _safe_float(factors.get("anomaly_score")),
        }
        dominant_name = max(factor_values, key=factor_values.get)
        return dominant_name, factor_values[dominant_name]

    def _suggestion_type_from_factors(self, factors: dict[str, Any]) -> str:
        flow_convergence = _safe_float(factors.get("flow_convergence_score"))
        bottleneck = _safe_float(factors.get("bottleneck_score"))
        density = _safe_float(factors.get("density_score"))
        density_rate = _safe_float(factors.get("density_rate_of_change"))

        if (
            flow_convergence >= bottleneck
            and flow_convergence >= density
            and flow_convergence >= density_rate
        ):
            return "barricade_reconfiguration"
        if (
            bottleneck >= flow_convergence
            and bottleneck >= density
            and bottleneck >= density_rate
        ):
            return "security_personnel"
        return "security_personnel"

    def _reason_for_suggestion(
        self,
        zone_id: str,
        suggestion_type: str,
        dominant_factor_name: str,
        dominant_factor_value: float,
        historical: bool,
    ) -> str:
        if historical:
            return (
                f"{zone_id} has prior incident history, so a precautionary medical_tent is recommended; "
                f"the strongest current factor is {dominant_factor_name}={dominant_factor_value:.2f}."
            )

        if suggestion_type == "barricade_reconfiguration":
            return (
                f"{zone_id} shows strong flow convergence ({dominant_factor_value:.2f} via {dominant_factor_name}), "
                "suggesting barriers should be adjusted to redirect incoming movement."
            )

        return (
            f"{zone_id} is being driven mainly by {dominant_factor_name}={dominant_factor_value:.2f}, "
            "so additional security personnel should be placed to manage crowd pressure."
        )


def generate_mock_historical_data() -> dict[str, Any]:
    # MOCK DATA FOR HACKATHON DEMO
    return {
        "events": [
            {
                "event_id": "mock_event_01",
                "attendance": 1200,
                "incident_zone_ids": ["zone_A2"],
            },
            {
                "event_id": "mock_event_02",
                "attendance": 1850,
                "incident_zone_ids": ["zone_B3", "zone_B4"],
            },
            {
                "event_id": "mock_event_03",
                "attendance": 2400,
                "incident_zone_ids": ["zone_C1"],
            },
        ]
    }
