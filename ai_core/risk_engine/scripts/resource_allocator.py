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

            factors = _safe_dict(zone.get("contributing_factors"))
            raw_risk = _safe_float(zone.get("risk_score"))
            anomaly_val = _safe_float(
                factors.get("anomaly_score")
                or factors.get("anomaly_indicator")
                or zone.get("anomaly_score")
            )
            anomaly_flags = (
                factors.get("anomaly_flags")
                or zone.get("anomaly_flags")
                or []
            )
            bottleneck_val = _safe_float(
                factors.get("bottleneck_score") or factors.get("bottleneck_indicator")
            )
            has_anomaly = anomaly_val > 0.0 or bool(anomaly_flags)
            has_bottleneck = bottleneck_val > 0.0 or bool(zone.get("bottleneck_detected"))
            has_surge = _safe_float(factors.get("density_rate_of_change")) > 0.08

            effective_rank = raw_risk
            if zone_id in historical_set:
                effective_rank += 0.15
            if has_anomaly:
                effective_rank += 0.35
            if has_bottleneck:
                effective_rank += 0.25
            if has_surge:
                effective_rank += 0.15

            if (
                raw_risk >= 0.20
                or has_anomaly
                or has_bottleneck
                or has_surge
                or zone_id in historical_set
            ):
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
        assigned_tactics: set[str] = set()

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

            risk_val = _safe_float(zone.get("risk_score"))
            anomaly_val = _safe_float(factors.get("anomaly_score") or factors.get("anomaly_indicator"))
            anomaly_flags = factors.get("anomaly_flags") or zone.get("anomaly_flags") or []
            bottleneck_val = _safe_float(factors.get("bottleneck_score") or factors.get("bottleneck_indicator"))

            if anomaly_val > 0.0 or bool(anomaly_flags) or bottleneck_val >= 0.3 or risk_val >= 0.55:
                priority = "high"
            elif risk_val >= 0.30 or _safe_float(factors.get("density_rate_of_change")) > 0.08:
                priority = "medium"
            else:
                priority = "low"

            is_historical = zone_id in historical_set

            if is_historical:
                selected_tactic = "medical_tent"
            else:
                ranked_tactics = self._rank_tactics_for_zone(
                    factors=factors,
                    risk_score=risk_val,
                    is_outdoor=bool(zone.get("is_outdoor", False)),
                    anomaly_flags=anomaly_flags,
                )

                # Prioritize high-scoring unique tactics across zones for maximum diversity
                selected_tactic = None
                for tactic, score in ranked_tactics:
                    if tactic not in assigned_tactics:
                        selected_tactic = tactic
                        break
                if not selected_tactic:
                    selected_tactic = ranked_tactics[0][0] if ranked_tactics else "security_personnel"

            assigned_tactics.add(selected_tactic)

            dominant_factor_name, dominant_factor_value = self._dominant_factor(factors)
            reason = self._reason_for_suggestion(
                zone_id=zone_id,
                suggestion_type=selected_tactic,
                factors=factors,
                dominant_factor_name=dominant_factor_name,
                dominant_factor_value=dominant_factor_value,
                historical=is_historical,
            )
            suggestions.append(
                {
                    "zone_id": zone_id,
                    "suggestion_type": selected_tactic,
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
            "bottleneck_score": _safe_float(
                factors.get("bottleneck_score") or factors.get("bottleneck_indicator")
            ),
            "anomaly_score": _safe_float(
                factors.get("anomaly_score") or factors.get("anomaly_indicator")
            ),
        }
        dominant_name = max(factor_values, key=factor_values.get)
        return dominant_name, factor_values[dominant_name]

    def _rank_tactics_for_zone(
        self,
        factors: dict[str, Any],
        risk_score: float = 0.0,
        is_outdoor: bool = False,
        anomaly_flags: list[str] | None = None,
    ) -> list[tuple[str, float]]:
        flags = set(anomaly_flags or [])
        anomaly = _safe_float(factors.get("anomaly_score") or factors.get("anomaly_indicator"))
        density_rate = _safe_float(factors.get("density_rate_of_change"))
        flow_convergence = _safe_float(factors.get("flow_convergence_score"))
        bottleneck = _safe_float(factors.get("bottleneck_score") or factors.get("bottleneck_indicator"))
        density = _safe_float(factors.get("density_score"))

        scores: dict[str, float] = {}

        # 1. Rapid Egress Dispatch: scored heavily by bottleneck & pinch points
        scores["rapid_egress_team"] = (bottleneck * 2.0) + (1.2 if "bottleneck" in flags else 0.0)

        # 2. Surge Response Unit: scored heavily by rapid density acceleration & incoming momentum
        scores["surge_response_team"] = (density_rate * 3.5) + (density * 0.3) + (1.0 if "sudden_surge" in flags else 0.0)

        # 3. Barricade Reconfiguration: scored heavily by multi-directional convergence & counter-flow
        scores["barricade_reconfiguration"] = (flow_convergence * 2.0) + (1.2 if "reverse_flow" in flags else 0.0)

        # 4. Medical & Triage Station: scored heavily by high density / critical risk
        scores["medical_tent"] = (density * 1.3) + (risk_score * 0.9)

        # 5. Aerial Drone Reconnaissance: scored by motion turbulence & unexplained anomalies
        scores["drone_surveillance"] = (anomaly * 1.5) + (1.2 if ("erratic_movement" in flags or "stampede" in flags) else 0.0)

        # 6. PA Directional Broadcasting: scored by elevated crowd volume needing redistribution
        scores["public_address_broadcaster"] = (density * 0.9) + (0.4 if risk_score >= 0.45 else 0.0)

        # 7. Hydration / Cooling Post: outdoor congestion
        if is_outdoor:
            scores["cooling_water_station"] = (density * 1.1) + 0.3

        # 8. Baseline Security Personnel
        scores["security_personnel"] = 0.25 + (risk_score * 0.2)

        # Return sorted list of (tactic_name, score) descending
        return sorted(scores.items(), key=lambda item: -item[1])

    def _suggestion_type_from_factors(
        self,
        factors: dict[str, Any],
        risk_score: float = 0.0,
        is_outdoor: bool = False,
    ) -> str:
        ranked = self._rank_tactics_for_zone(factors, risk_score=risk_score, is_outdoor=is_outdoor)
        return ranked[0][0] if ranked else "security_personnel"

    def _reason_for_suggestion(
        self,
        zone_id: str,
        suggestion_type: str,
        factors: dict[str, Any],
        dominant_factor_name: str,
        dominant_factor_value: float,
        historical: bool,
    ) -> str:
        if historical:
            return (
                f"{zone_id} has prior incident history; precautionary medical station & paramedic staging "
                f"is recommended (strongest current metric: {dominant_factor_name}={dominant_factor_value:.2f})."
            )

        if suggestion_type == "rapid_egress_team":
            bot_val = _safe_float(factors.get("bottleneck_score") or factors.get("bottleneck_indicator") or dominant_factor_value)
            return (
                f"{zone_id} exhibits critical bottleneck constriction (bottleneck_score={bot_val:.2f}); "
                "dispatching rapid egress marshals to unlock secondary emergency gates and clear exit chokepoints."
            )

        if suggestion_type == "surge_response_team":
            rate_val = _safe_float(factors.get("density_rate_of_change") or dominant_factor_value)
            return (
                f"{zone_id} detected rapid crowd surge acceleration (rate_of_change={rate_val:.2f}/sec); "
                "deploying rapid surge intervention unit to absorb wave momentum and regulate influx rate."
            )

        if suggestion_type == "drone_surveillance":
            anom_val = _safe_float(factors.get("anomaly_score") or factors.get("anomaly_indicator") or dominant_factor_value)
            return (
                f"{zone_id} flagged anomalous crowd movement patterns (anomaly_score={anom_val:.2f}); "
                "deploying autonomous aerial drone surveillance for real-time overhead situational tracking."
            )

        if suggestion_type == "barricade_reconfiguration":
            flow_val = _safe_float(factors.get("flow_convergence_score") or dominant_factor_value)
            return (
                f"{zone_id} shows high multi-directional flow convergence (convergence_score={flow_val:.2f}); "
                "reconfiguring directional barriers to channel crowds into unidirectional streams."
            )

        if suggestion_type == "public_address_broadcaster":
            dens_val = _safe_float(factors.get("density_score") or dominant_factor_value)
            return (
                f"{zone_id} crowd density ({dens_val:.2f}) requires active redirection; "
                "broadcasting localized directional PA acoustic alerts and updating digital signage."
            )

        if suggestion_type == "cooling_water_station":
            return (
                f"{zone_id} dense outdoor crowd accumulation ({dominant_factor_value:.2f} via {dominant_factor_name}); "
                "staging mobile hydration and thermal cooling relief post to prevent heat exhaustion."
            )

        if suggestion_type == "medical_tent":
            dens_val = _safe_float(factors.get("density_score") or dominant_factor_value)
            return (
                f"{zone_id} exhibits critical crowd risk ({dens_val:.2f} density); "
                "staging mobile paramedic triage station and emergency AED first-responders."
            )

        return (
            f"{zone_id} crowd activity driven by {dominant_factor_name}={dominant_factor_value:.2f}; "
            "positioning safety marshals and security stewards to maintain orderly flow and perimeter safety."
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
