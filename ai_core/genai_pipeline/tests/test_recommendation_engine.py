#!/usr/bin/env python3
"""
test_recommendation_engine.py — Unit tests for RecommendationEngine with mocked LLM calls.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Ensure scripts directory is in sys.path
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from recommendation_engine import FALLBACK_RECOMMENDATIONS, RecommendationEngine
from llm_client import LLMClientError


@pytest.fixture
def sample_zone_data():
    return {
        "zone_id": "zone_A1",
        "risk_level": "critical",
        "risk_score": 0.85,
        "contributing_factors": {
            "density_score": 0.8,
            "flow_convergence_score": 0.9,
            "bottleneck_indicator": 1.0,
        },
    }


def test_successful_recommendation_generation(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "recommendations": [
            {
                "action": "Close entry gate 3 and redirect incoming visitors to gate 5",
                "category": "flow_management",
                "urgency": "immediate",
                "reasoning": "Zone A1 shows high flow convergence from 3 adjacent zones.",
            }
        ]
    }

    engine = RecommendationEngine(llm_client=mock_client)
    res = engine.generate_recommendations(sample_zone_data)

    assert res["zone_id"] == "zone_A1"
    assert res["risk_level"] == "critical"
    assert "generated_at" in res
    assert len(res["recommendations"]) == 1
    assert res["recommendations"][0]["action"] == "Close entry gate 3 and redirect incoming visitors to gate 5"
    assert res["recommendations"][0]["category"] == "flow_management"
    assert res["recommendations"][0]["urgency"] == "immediate"


def test_fallback_on_malformed_json_missing_recommendations_key(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {"invalid_key": []}

    engine = RecommendationEngine(llm_client=mock_client)
    res = engine.generate_recommendations(sample_zone_data)

    assert res["zone_id"] == "zone_A1"
    assert res["recommendations"] == FALLBACK_RECOMMENDATIONS


def test_fallback_on_malformed_json_missing_required_keys(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "recommendations": [
            {
                "action": "Close gate",
                # missing category, urgency, reasoning
            }
        ]
    }

    engine = RecommendationEngine(llm_client=mock_client)
    res = engine.generate_recommendations(sample_zone_data)

    assert res["recommendations"] == FALLBACK_RECOMMENDATIONS


def test_fallback_on_empty_recommendations_list(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {"recommendations": []}

    engine = RecommendationEngine(llm_client=mock_client)
    res = engine.generate_recommendations(sample_zone_data)

    assert res["recommendations"] == FALLBACK_RECOMMENDATIONS


def test_fallback_on_llm_client_error(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.side_effect = LLMClientError("API connection error")

    engine = RecommendationEngine(llm_client=mock_client)
    res = engine.generate_recommendations(sample_zone_data)

    assert res["recommendations"] == FALLBACK_RECOMMENDATIONS


def test_prompt_includes_flow_convergence_and_neighbors(sample_zone_data):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "recommendations": [
            {
                "action": "Institute one-way pedestrian flow",
                "category": "flow_management",
                "urgency": "immediate",
                "reasoning": "High convergence detected.",
            }
        ]
    }

    neighbors = [
        {"zone_id": "zone_A2", "risk_level": "moderate", "risk_score": 0.4}
    ]

    engine = RecommendationEngine(llm_client=mock_client)
    engine.generate_recommendations(sample_zone_data, neighbor_zones_data=neighbors)

    mock_client.generate_json.assert_called_once()
    called_prompt = mock_client.generate_json.call_args[0][0]

    assert "flow_convergence_score" in called_prompt
    assert "one-way pedestrian flow" in called_prompt
    assert "zone_A2" in called_prompt
