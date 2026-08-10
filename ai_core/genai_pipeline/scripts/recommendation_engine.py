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


class RecommendationEngine:
    """
    Generates actionable crowd-control recommendations using LLMClient.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.client = llm_client or LLMClient()

    def generate_recommendations(
        self,
        zone_risk_data: dict[str, Any],
        neighbor_zones_data: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Generate 2-4 tactical recommendations for a given zone.

        Parameters
        ----------
        zone_risk_data : dict
            Dict containing 'zone_id', 'risk_level', 'contributing_factors', etc.
        neighbor_zones_data : list[dict] | None
            Optional list of neighboring zone states for broader context.

        Returns
        -------
        dict
            Dict matching the specified recommendation schema.
        """
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
            logger.warning(
                "Recommendation generation failed for zone %s: %s. Falling back to default recommendation.",
                zone_id,
                exc,
            )
            validated_recs = FALLBACK_RECOMMENDATIONS

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
            "Given this zone's risk data, suggest 2-4 SPECIFIC, ACTIONABLE interventions.",
            "For each intervention provide:",
            "- action: an imperative sentence (e.g. 'Close entry gate 3', 'Institute one-way pedestrian flow from the north entrance toward the main exit')",
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
