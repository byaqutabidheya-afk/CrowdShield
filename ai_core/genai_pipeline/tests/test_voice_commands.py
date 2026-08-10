#!/usr/bin/env python3
"""
test_voice_commands.py — Unit tests for VoiceCommandProcessor intent matching.
"""

import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from voice_commands import VoiceCommandProcessor


@pytest.fixture
def processor():
    return VoiceCommandProcessor()


def test_navigate_to_zone_intent(processor):
    res = processor.match_intent("show me zone A1")
    assert res["matched_intent"] == "navigate_to_zone"
    assert res["intent_params"] == {"zone_id": "zone_A1"}
    assert res["confidence"] == "high"

    res2 = processor.match_intent("display zone B2")
    assert res2["matched_intent"] == "navigate_to_zone"
    assert res2["intent_params"] == {"zone_id": "zone_B2"}

    res3 = processor.match_intent("go to zone_A1")
    assert res3["matched_intent"] == "navigate_to_zone"
    assert res3["intent_params"] == {"zone_id": "zone_A1"}


def test_query_risk_status_without_zone(processor):
    res = processor.match_intent("what is the current risk level")
    assert res["matched_intent"] == "query_risk_status"
    assert res["intent_params"] == {}
    assert res["confidence"] == "high"

    res2 = processor.match_intent("what's the risk status")
    assert res2["matched_intent"] == "query_risk_status"
    assert res2["intent_params"] == {}


def test_query_risk_status_with_zone(processor):
    res = processor.match_intent("what's the risk in zone A1")
    assert res["matched_intent"] == "query_risk_status"
    assert res["intent_params"] == {"zone_id": "zone_A1"}
    assert res["confidence"] == "high"


def test_trigger_announcement_intent(processor):
    res = processor.match_intent("broadcast evacuation alert to all zones")
    assert res["matched_intent"] == "trigger_announcement"
    assert res["intent_params"] == {}
    assert res["confidence"] == "high"

    res2 = processor.match_intent("announce emergency exit route")
    assert res2["matched_intent"] == "trigger_announcement"


def test_close_gate_intent(processor):
    res = processor.match_intent("close gate 3")
    assert res["matched_intent"] == "close_gate"
    assert res["intent_params"] == {"gate_number": 3}
    assert res["confidence"] == "high"

    res2 = processor.match_intent("close gate 5")
    assert res2["matched_intent"] == "close_gate"
    assert res2["intent_params"] == {"gate_number": 5}


def test_unrecognized_intent(processor):
    res = processor.match_intent("what is the weather today")
    assert res["matched_intent"] == "unrecognized"
    assert res["intent_params"] == {}
    assert res["confidence"] == "low"
