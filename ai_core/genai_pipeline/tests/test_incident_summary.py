#!/usr/bin/env python3
"""
test_incident_summary.py — Unit tests for IncidentSummaryGenerator with mocked LLM calls.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from incident_summary import IncidentSummaryGenerator
from llm_client import LLMClientError


@pytest.fixture
def sample_time_series():
    return [
        {
            "timestamp": "2026-08-09T14:00:00Z",
            "zone_id": "zone_A1",
            "risk_score": 0.30,
            "risk_level": "low",
            "contributing_factors": {"density_score": 0.3},
        },
        {
            "timestamp": "2026-08-09T14:00:30Z",
            "zone_id": "zone_A1",
            "risk_score": 0.60,
            "risk_level": "high",
            "contributing_factors": {"density_score": 0.6, "bottleneck_indicator": 1.0},
        },
        {
            "timestamp": "2026-08-09T14:01:00Z",
            "zone_id": "zone_A1",
            "risk_score": 0.90,
            "risk_level": "critical",
            "contributing_factors": {"density_score": 0.9, "flow_convergence_score": 0.8},
        },
    ]


def test_successful_summary_generation(sample_time_series):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "peak_risk_score": 0.90,
        "duration_at_risk_seconds": 60,
        "likely_cause": "Rapid crowd accumulation combined with narrow exit bottlenecking.",
        "narrative_summary": "Zone A1 escalated from low to critical risk over a 60-second window due to sudden density increase.",
    }

    generator = IncidentSummaryGenerator(llm_client=mock_client)
    summary = generator.generate_summary("zone_A1", sample_time_series)

    assert summary["zone_id"] == "zone_A1"
    assert summary["peak_risk_score"] == 0.90
    assert summary["duration_at_risk_seconds"] == 60
    assert "bottlenecking" in summary["likely_cause"]
    assert "narrative_summary" in summary
    assert summary["resolution_status"] == "resolved"
    assert "generated_at" in summary


def test_fallback_on_llm_client_error(sample_time_series):
    mock_client = MagicMock()
    mock_client.generate_json.side_effect = LLMClientError("API limit exceeded")

    generator = IncidentSummaryGenerator(llm_client=mock_client)
    summary = generator.generate_summary("zone_A1", sample_time_series)

    assert summary["zone_id"] == "zone_A1"
    assert summary["peak_risk_score"] == 0.90
    assert summary["duration_at_risk_seconds"] == 60
    assert "narrative_summary" in summary
    assert "Primary driver:" in summary["likely_cause"] or "Elevated crowd" in summary["likely_cause"]


def test_fallback_on_malformed_llm_json(sample_time_series):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "peak_risk_score": 0.90,
        # missing likely_cause and narrative_summary
    }

    generator = IncidentSummaryGenerator(llm_client=mock_client)
    summary = generator.generate_summary("zone_A1", sample_time_series)

    assert summary["zone_id"] == "zone_A1"
    assert summary["peak_risk_score"] == 0.90
    assert summary["duration_at_risk_seconds"] == 60
    assert "narrative_summary" in summary


def test_empty_time_series_handled_safely():
    mock_client = MagicMock()

    generator = IncidentSummaryGenerator(llm_client=mock_client)
    summary = generator.generate_summary("zone_A1", [])

    assert summary["zone_id"] == "zone_A1"
    assert summary["peak_risk_score"] == 0.0
    assert summary["duration_at_risk_seconds"] == 0
    assert mock_client.generate_json.call_count == 0  # Should skip LLM call on empty series
