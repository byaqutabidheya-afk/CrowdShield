#!/usr/bin/env python3
"""
test_translation_tts.py — Unit tests for MultilingualAnnouncer with mocked LLM and TTS.
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from translation_tts import MultilingualAnnouncer
from llm_client import LLMClientError


@pytest.fixture
def announcer():
    mock_client = MagicMock()
    mock_client.generate_json.return_value = {
        "hi": "कृपया निकास बी की ओर जाएं।",
        "ta": "தயவுசெய்து வெளியேறு பி நோக்கி செல்லவும்.",
        "te": "దయచేసి నిష్క్రమణ B వైపు వెళ్లండి.",
        "bn": "অনুগ্রহ করে এক্সিট বি-এর দিকে যান।",
        "mr": "कृपया एक्झिट बी कडे जा.",
    }
    return MultilingualAnnouncer(llm_client=mock_client)


def test_translate_message_success(announcer):
    res = announcer.translate_message("Please move calmly toward Exit B.")
    assert "hi" in res
    assert "ta" in res
    assert "te" in res
    assert "bn" in res
    assert "mr" in res
    assert res["hi"] == "कृपया निकास बी की ओर जाएं।"


def test_translate_message_llm_fallback():
    mock_client = MagicMock()
    mock_client.generate_json.side_effect = LLMClientError("Translation model error")

    announcer = MultilingualAnnouncer(llm_client=mock_client)
    res = announcer.translate_message("Avoid Zone A1.")

    assert "hi" in res
    assert "ta" in res
    assert "Zone A1" in res["hi"] or "ए1" in res["hi"]


@pytest.mark.anyio
async def test_generate_audio_creates_file(tmp_path):
    announcer = MultilingualAnnouncer()
    out_dir = str(tmp_path / "audio")

    # Test generate_audio creates a file in out_dir
    filepath = await announcer.generate_audio("Test announcement text", "hi", output_dir=out_dir)

    assert Path(filepath).exists()
    assert filepath.endswith(".mp3")


@pytest.mark.anyio
async def test_create_multilingual_alert_schema(announcer, tmp_path):
    out_dir = str(tmp_path / "audio")

    with patch.object(announcer, "generate_audio", new_callable=AsyncMock) as mock_audio:
        mock_audio.side_effect = lambda text, lang, output_dir: f"{output_dir}/alert_{lang}.mp3"

        alert = await announcer.create_multilingual_alert(
            "Please move calmly toward Exit B.",
            target_languages=["hi", "ta"],
            output_dir=out_dir,
        )

        assert alert["base_message_en"] == "Please move calmly toward Exit B."
        assert "generated_at" in alert
        assert "hi" in alert["translations"]
        assert "ta" in alert["translations"]
        assert alert["translations"]["hi"]["text"] == "कृपया निकास बी की ओर जाएं।"
        assert alert["translations"]["hi"]["audio_path"].endswith("alert_hi.mp3")


def test_format_for_social_channels(announcer):
    mock_alert = {
        "base_message_en": "Please move calmly toward Exit B.",
        "translations": {
            "hi": {"text": "कृपया निकास बी की ओर जाएं।", "audio_path": "audio/hi.mp3"}
        },
    }

    res = announcer.format_for_social_channels(mock_alert, platforms=["X", "Instagram"])

    assert "dispatches" in res
    assert len(res["dispatches"]) == 2
    assert res["dispatches"][0]["platform"] == "X"
    assert res["dispatches"][0]["status"] == "simulated_post"
    assert "Exit B" in res["dispatches"][0]["formatted_text"]
    assert res["dispatches"][1]["platform"] == "Instagram"
    assert res["dispatches"][1]["status"] == "simulated_post"
