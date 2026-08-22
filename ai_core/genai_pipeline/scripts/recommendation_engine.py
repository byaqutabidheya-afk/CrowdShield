#!/usr/bin/env python3
"""
recommendation_engine.py — CrowdShield GenAI Pipeline | Batch 2: Recommendation Engine

Translates Phase 2 numerical risk scores and contributing factors into 2-4
specific, actionable interventions for event control room operators using LLMClient.
"""

from __future__ import annotations

import datetime
import logging
import sys
from pathlib import Path
from typing import Any

# Ensure script directory is in sys.path for local imports
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
except ImportError:
    from .llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)

FALLBACK_RECOMMENDATIONS: list[dict[str, str]] = [
    {
        "action": "Increase monitoring of this zone",
        "category": "crowd_control",
        "urgency": "soon",
        "reasoning": "Generic fallback recommendation due to invalid LLM output or API failure.",
    }
]


def _generate_contextual_fallback(zone_risk_data: dict[str, Any]) -> list[dict[str, str]]:
    factors = zone_risk_data.get("contributing_factors", {})
    recs = []
    zone_id = zone_risk_data.get("zone_id", "Zone")
    risk_level = str(zone_risk_data.get("risk_level", "high")).lower()
    risk_score = float(zone_risk_data.get("risk_score", 0.0))

    if factors.get("bottleneck_indicator", 0) > 0.3 or factors.get("bottleneck_score", 0) > 0.3:
        recs.append({
            "action": f"Dispatch rapid egress team to unlock secondary exit gates and clear corridors in {zone_id}.",
            "category": "flow_management",
            "urgency": "immediate" if risk_level == "critical" else "soon",
            "reasoning": f"Severe bottleneck accumulation detected in {zone_id}."
        })
    if factors.get("flow_convergence_score", 0) > 0.3 or factors.get("reverse_flow_indicator", 0) > 0.3:
        recs.append({
            "action": f"Erect directional flow deflection barricades and enforce one-way movement at {zone_id}.",
            "category": "flow_management",
            "urgency": "immediate" if risk_level == "critical" else "soon",
            "reasoning": f"Counter-flow opposing vectors causing turbulent crowd pressure in {zone_id}."
        })
    if factors.get("anomaly_indicator", 0) > 0.25 or factors.get("anomaly_score", 0) > 0.25:
        recs.append({
            "action": f"Launch aerial drone surveillance over {zone_id} for wide-area overhead situational tracking.",
            "category": "resource_deployment",
            "urgency": "immediate",
            "reasoning": f"Anomalous crowd motion or stampede turbulence flagged in {zone_id}."
        })
    if factors.get("density_rate_of_change", 0) > 0.15:
        recs.append({
            "action": f"Deploy rapid surge intervention unit with safety marshals to absorb influx momentum in {zone_id}.",
            "category": "crowd_control",
            "urgency": "immediate",
            "reasoning": f"Rapid crowd surge buildup rate observed in {zone_id}."
        })
    if risk_score >= 0.7 or risk_level == "critical":
        recs.append({
            "action": f"Stage mobile paramedic triage station and emergency AED first-responders near {zone_id}.",
            "category": "resource_deployment",
            "urgency": "immediate",
            "reasoning": f"Critical risk score ({risk_score:.2f}) requires precautionary medical staging in {zone_id}."
        })
    if factors.get("density_score", 0) > 0.2:
        recs.append({
            "action": f"Broadcast localized directional PA announcement and update digital signage to divert incoming flow from {zone_id}.",
            "category": "communication",
            "urgency": "soon",
            "reasoning": f"Crowd density exceeding nominal safety margins in {zone_id}."
        })
    if not recs:
        recs.append({
            "action": f"Deploy secondary safety stewards to monitor {zone_id}.",
            "category": "resource_deployment",
            "urgency": "soon",
            "reasoning": f"Elevated crowd risk level ({risk_level}) observed in {zone_id}."
        })
    return recs[:4]


class RecommendationEngine:
    """
    Generates actionable crowd-control recommendations using LLMClient with fast rule-based fallback.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.client = llm_client or LLMClient()

    def generate_recommendations(
        self,
        zone_risk_data: dict[str, Any],
        neighbor_zones_data: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        zone_id = zone_risk_data.get("zone_id", "unknown_zone")
        risk_level = zone_risk_data.get("risk_level", "unknown")
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        prompt = self._build_prompt(zone_risk_data, neighbor_zones_data)
        schema_hint = (
            '{"recommendations": ['
            '{"action": str, "category": "flow_management"|"resource_deployment"|"crowd_control"|"communication", '
            '"urgency": "immediate"|"soon"|"monitor", "reasoning": str}'
            "]}"
        )

        try:
            raw_response = self.client.generate_json(prompt, schema_hint)
            validated_recs = self._validate_and_format_recommendations(raw_response)
        except Exception as exc:
            logger.info(
                "Recommendation generation used contextual fallback for %s (%s)",
                zone_id,
                exc,
            )
            validated_recs = _generate_contextual_fallback(zone_risk_data) or FALLBACK_RECOMMENDATIONS

        return {
            "zone_id": zone_id,
            "risk_level": risk_level,
            "recommendations": validated_recs,
            "generated_at": now_iso,
        }

    def _build_prompt(
        self,
        zone_risk_data: dict[str, Any],
        neighbor_zones_data: list[dict[str, Any]] | None = None,
    ) -> str:
        zone_id = zone_risk_data.get("zone_id", "unknown")
        risk_level = zone_risk_data.get("risk_level", "unknown")
        risk_score = zone_risk_data.get("risk_score", "N/A")
        contributing_factors = zone_risk_data.get("contributing_factors", {})

        prompt_lines = [
            "You are a crowd safety advisor for event control room operators.",
            f"Zone ID: {zone_id}",
            f"Current Risk Level: {risk_level} (Risk Score: {risk_score})",
            "Contributing Factors:",
        ]

        for factor, val in contributing_factors.items():
            prompt_lines.append(f"  - {factor}: {val}")

        if neighbor_zones_data:
            prompt_lines.append("Neighboring Zones Summary:")
            for n in neighbor_zones_data:
                n_id = n.get("zone_id", "neighbor")
                n_level = n.get("risk_level", "unknown")
                n_score = n.get("risk_score", "N/A")
                prompt_lines.append(f"  - {n_id}: risk_level={n_level}, risk_score={n_score}")

        prompt_lines.extend([
            "",
            "Given this zone's risk data, suggest 2-4 DIVERSE, SPECIFIC, ACTIONABLE interventions covering multiple tactical dimensions.",
            "Draw from diverse tactical measures including:",
            "- flow_management: Directional flow-deflection barricades, one-way pedestrian routing, or metering ingress gates.",
            "- resource_deployment: Emergency paramedic/medical station staging, autonomous aerial drone reconnaissance, mobile cooling/hydration stations, or dynamic signage.",
            "- crowd_control: Rapid surge intervention units, perimeter safety marshals, or emergency egress teams opening secondary gates.",
            "- communication: Directional PA acoustic broadcast announcements and digital signage crowd redistribution guidance.",
            "",
            "For each intervention provide:",
            "- action: an imperative sentence (e.g. 'Close entry gate 3', 'Institute one-way pedestrian flow from the north entrance toward the main exit', 'Deploy rapid egress team to unlock emergency gate 2B', 'Stage mobile paramedic triage unit at zone perimeter')",
            "- category: one of: flow_management, resource_deployment, crowd_control, communication",
            "- urgency: one of: immediate, soon, monitor",
            "- reasoning: 1 sentence referencing the SPECIFIC contributing factor driving this recommendation.",
            "",
            "When flow_convergence_score is the dominant contributing factor, explicitly consider recommending one-way pedestrian flow or a flow-direction change, since that factor indicates a multi-directional convergence problem.",
            "",
            'Return JSON: {"recommendations": [...]}'
        ])

        return "\n".join(prompt_lines)

    def _validate_and_format_recommendations(
        self, response: dict[str, Any]
    ) -> list[dict[str, Any]]:
        if not isinstance(response, dict) or "recommendations" not in response:
            raise ValueError("Response dict missing 'recommendations' key.")

        recs = response["recommendations"]
        if not isinstance(recs, list) or len(recs) == 0:
            raise ValueError("'recommendations' must be a non-empty list.")

        validated = []
        required_keys = {"action", "category", "urgency", "reasoning"}

        for item in recs:
            if not isinstance(item, dict):
                raise ValueError("Recommendation item is not a dictionary.")
            if not required_keys.issubset(item.keys()):
                missing = required_keys - item.keys()
                raise ValueError(f"Recommendation item missing required keys: {missing}")

            action = str(item["action"]).strip()
            category = str(item["category"]).strip()
            urgency = str(item["urgency"]).strip()
            reasoning = str(item["reasoning"]).strip()

            if not action or not reasoning:
                raise ValueError("Action and reasoning must be non-empty strings.")

            validated.append({
                "action": action,
                "category": category,
                "urgency": urgency,
                "reasoning": reasoning,
            })

        return validated


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)

    print("=" * 60)
    print("  CrowdShield RecommendationEngine — Standalone Quick Check")
    print("=" * 60)

    sample_zone_data = {
        "zone_id": "zone_A1",
        "risk_level": "critical",
        "risk_score": 0.82,
        "contributing_factors": {
            "density_score": 0.71,
            "density_rate_of_change": 0.15,
            "flow_convergence_score": 0.60,
            "bottleneck_indicator": 1.0,
            "anomaly_indicator": 0.33,
        },
    }

    sample_neighbors = [
        {"zone_id": "zone_A2", "risk_level": "moderate", "risk_score": 0.45},
        {"zone_id": "zone_B1", "risk_level": "low", "risk_score": 0.20},
    ]

    try:
        engine = RecommendationEngine()
        output = engine.generate_recommendations(sample_zone_data, sample_neighbors)
        print("\n  ✓ Result generated:\n")
        print(json.dumps(output, indent=2))
    except Exception as err:
        print(f"\n  ✗ Execution failed (or quota hit): {err}")
