#!/usr/bin/env python3
"""
test_pipeline.py — Integration and unit tests for GenAIPipeline orchestrator and CLI.
"""

import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "phase2_sample_output.json"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from pipeline import GenAIPipeline


@pytest.fixture
def sample_risk_data():
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


def test_recommend_orchestrator(sample_risk_data):
    pipeline = GenAIPipeline()
    res = pipeline.recommend(sample_risk_data)

    assert res["zone_id"] == "zone_A1"
    assert "recommendations" in res
    assert len(res["recommendations"]) >= 1


def test_summarize_orchestrator(sample_risk_data):
    pipeline = GenAIPipeline()
    res = pipeline.summarize("zone_A1", [sample_risk_data])

    assert res["zone_id"] == "zone_A1"
    assert "peak_risk_score" in res
    assert "narrative_summary" in res


def test_sentiment_orchestrator():
    pipeline = GenAIPipeline()
    res = pipeline.analyze_sentiment()

    assert res["posts_analyzed"] >= 10
    assert 0.0 <= res["aggregated_unrest_score"] <= 1.0
    assert "flagged_posts" in res


def test_voice_orchestrator(sample_risk_data):
    pipeline = GenAIPipeline()
    res = pipeline.process_voice(
        command_text="show me zone A1",
        current_zone_risk_data=[sample_risk_data],
    )

    assert res["transcribed_text"] == "show me zone A1"
    assert res["matched_intent"] == "navigate_to_zone"
    assert res["intent_params"] == {"zone_id": "zone_A1"}
    assert "responder_answer" in res


@pytest.mark.anyio
async def test_announce_orchestrator(tmp_path):
    pipeline = GenAIPipeline()
    res = await pipeline.announce(
        "Please move calmly toward Exit B.",
        target_languages=["hi", "ta"],
        output_dir=str(tmp_path / "audio"),
    )

    assert res["base_message_en"] == "Please move calmly toward Exit B."
    assert "translations" in res
    assert "social_dispatches" in res
