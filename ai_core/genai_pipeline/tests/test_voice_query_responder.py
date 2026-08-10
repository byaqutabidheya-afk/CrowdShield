#!/usr/bin/env python3
"""
test_voice_query_responder.py — Unit tests for VoiceQueryResponder with mocked LLM and TTS.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from voice_query_responder import VoiceQueryResponder
from llm_client import LLMClientError


@pytest.fixture
def sample_zones():
    return [
        {
            "zone_id": "zone_A1",
            "risk_score": 0.85,
            "risk_level": "critical",
            "contributing_factors": {
                "density_score": 0.70,
                "flow_convergence_score": 0.95,
                "bottleneck_indicator": 1.0,
            },
        },
        {
            "zone_id": "zone_B2",
            "risk_score": 0.40,
            "risk_level": "moderate",
            "contributing_factors": {
                "density_score": 0.35,
                "flow_convergence_score": 0.20,
            },
        },
    ]


def test_highest_risk_query(sample_zones):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "answer": "Zone A1 currently has the highest risk at 0.85, critical level, driven mainly by flow convergence."
    }

    responder = VoiceQueryResponder(llm_client=mock_client)
    res = responder.answer_query("query_risk_status", {}, sample_zones)

    assert res["zone_id"] == "zone_A1"
    assert "0.85" in res["answer_text"] or "Zone A1" in res["answer_text"]
    assert "critical" in res["answer_text"]


def test_specific_zone_query(sample_zones):
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "answer": "Zone B2 is currently at a moderate risk level with a score of 0.40."
    }

    responder = VoiceQueryResponder(llm_client=mock_client)
    res = responder.answer_query("query_risk_status", {"zone_id": "zone_B2"}, sample_zones)

    assert res["zone_id"] == "zone_B2"
    assert "zone_B2" in res["answer_text"] or "Zone B2" in res["answer_text"]


def test_fallback_template_on_llm_error(sample_zones):
    mock_client = MagicMock()
    mock_client.generate_json.side_effect = LLMClientError("LLM error")

    responder = VoiceQueryResponder(llm_client=mock_client)
    res = responder.answer_query("query_risk_status", {}, sample_zones)

    assert res["zone_id"] == "zone_A1"
    assert "Zone zone_A1 currently has the highest risk at 0.85" in res["answer_text"]


def test_other_intents(sample_zones):
    responder = VoiceQueryResponder()

    res_nav = responder.answer_query("navigate_to_zone", {"zone_id": "zone_A1"}, sample_zones)
    assert res_nav["zone_id"] == "zone_A1"
    assert "Navigating" in res_nav["answer_text"]

    res_gate = responder.answer_query("close_gate", {"gate_number": 3}, sample_zones)
    assert res_gate["zone_id"] is None
    assert "gate 3" in res_gate["answer_text"]


@pytest.mark.anyio
async def test_answer_to_speech(tmp_path):
    mock_announcer = MagicMock()
    mock_announcer.generate_audio = AsyncMock(return_value=str(tmp_path / "answer.mp3"))

    responder = VoiceQueryResponder(announcer=mock_announcer)
    audio_path = await responder.answer_to_speech("Zone A1 is critical.")

    assert audio_path.endswith("answer.mp3")
    mock_announcer.generate_audio.assert_called_once_with(
        "Zone A1 is critical.", "en", output_dir="ai_core/genai_pipeline/audio_output/"
    )
