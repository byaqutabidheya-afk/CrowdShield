#!/usr/bin/env python3
"""
voice_commands.py — CrowdShield GenAI Pipeline | Batch 6: Voice Command STT & Intent Processor

Captures operator voice input using faster-whisper (STT) and maps transcribed text to
control room intents using fast local regex/keyword matching.
"""

from __future__ import annotations

import logging
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

logger = logging.getLogger(__name__)


class VoiceCommandProcessor:
    """
    Transcribes audio commands using faster-whisper and classifies control room intents.
    """

    def __init__(self, model_size: str = "base", device: str = "cpu") -> None:
        self.model_size = model_size
        self.device = device
        self._model = None

    def _get_model(self):
        if self._model is None:
            if WhisperModel is None:
                raise ImportError(
                    "faster-whisper package is required for transcription. "
                    "Install it with: pip install faster-whisper"
                )
            logger.info("Loading faster-whisper model (%s)...", self.model_size)
            self._model = WhisperModel(
                self.model_size, device=self.device, compute_type="int8"
            )
        return self._model

    def transcribe_audio(self, audio_file_path: str) -> str:
        """
        Transcribe a local audio file to text using faster-whisper.

        Parameters
        ----------
        audio_file_path : str
            Path to the local audio file (.wav, .mp3, .flac).

        Returns
        -------
        str
            Transcribed text.
        """
        path = Path(audio_file_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found at: {audio_file_path}")

        try:
            model = self._get_model()
            segments, info = model.transcribe(str(path), beam_size=5)
            transcribed_text = " ".join(s.text for s in segments).strip()
            logger.info("Transcribed text: '%s'", transcribed_text)
            return transcribed_text
        except Exception as exc:
            logger.error("Audio transcription failed: %s", exc)
            raise RuntimeError(f"Transcription failed: {exc}") from exc

    def match_intent(self, transcribed_text: str) -> dict[str, Any]:
        """
        Classify transcribed text into a structured control room intent using local rules.

        Parameters
        ----------
        transcribed_text : str
            Input text phrase.

        Returns
        -------
        dict
            Dict containing matched_intent, intent_params, and confidence.
        """
        text = transcribed_text.strip()
        text_lower = text.lower()

        # Helper: Extract zone ID from text (e.g., "zone A1", "zone_A1", "A1")
        zone_id = self._extract_zone_id(text_lower)

        # 1. Close gate intent: "close gate {N}"
        gate_match = re.search(r"\bclose\s+gate\s+([a-zA-Z0-9]+)\b", text_lower)
        if gate_match:
            gate_val = gate_match.group(1)
            # Cast to int if purely numeric
            gate_param = int(gate_val) if gate_val.isdigit() else gate_val.upper()
            return {
                "matched_intent": "close_gate",
                "intent_params": {"gate_number": gate_param},
                "confidence": "high",
            }

        # 2. Navigation intent: "show / display / go to / navigate to zone {X}"
        nav_keywords = ["show", "display", "go to", "navigate", "view", "open zone"]
        if any(kw in text_lower for kw in nav_keywords) and zone_id:
            return {
                "matched_intent": "navigate_to_zone",
                "intent_params": {"zone_id": zone_id},
                "confidence": "high",
            }

        # 3. Query risk status intent: "what is the risk level", "current risk", "risk status"
        risk_keywords = [
            "risk level",
            "risk status",
            "current risk",
            "what is the risk",
            "what's the risk",
            "how dangerous",
        ]
        if any(kw in text_lower for kw in risk_keywords):
            params = {}
            if zone_id:
                params["zone_id"] = zone_id
            return {
                "matched_intent": "query_risk_status",
                "intent_params": params,
                "confidence": "high",
            }

        # 4. Trigger announcement intent: "broadcast", "announce", "send alert"
        announcement_keywords = [
            "broadcast",
            "announce",
            "send alert",
            "make announcement",
            "trigger alert",
            "broadcast alert",
        ]
        if any(kw in text_lower for kw in announcement_keywords):
            return {
                "matched_intent": "trigger_announcement",
                "intent_params": {},
                "confidence": "high",
            }

        # 5. Unrecognized intent
        return {
            "matched_intent": "unrecognized",
            "intent_params": {},
            "confidence": "low",
        }

    def process_voice_command(self, audio_file_path: str) -> dict[str, Any]:
        """
        Orchestrate transcription and intent matching for an audio file.

        Returns dict matching Phase 3 deliverable schema:
        {
          "transcribed_text": "show me zone A1",
          "matched_intent": "navigate_to_zone",
          "intent_params": {"zone_id": "zone_A1"},
          "confidence": "high"
        }
        """
        transcribed_text = self.transcribe_audio(audio_file_path)
        intent_data = self.match_intent(transcribed_text)

        return {
            "transcribed_text": transcribed_text,
            "matched_intent": intent_data["matched_intent"],
            "intent_params": intent_data["intent_params"],
            "confidence": intent_data["confidence"],
        }

    @staticmethod
    def _extract_zone_id(text_lower: str) -> str | None:
        """
        Extract and format a zone ID (e.g. 'zone_A1') from text.
        """
        # Match 'zone A1', 'zone_A1', 'zone 1', 'zone B2'
        m = re.search(r"\bzone[_\s]*([a-zA-Z]?\d+)\b", text_lower)
        if m:
            raw_id = m.group(1).upper()
            return f"zone_{raw_id}"

        # Match standalone zone codes like 'A1', 'B2' when preceded by keywords
        m_alt = re.search(r"\b([a-zA-Z]\d+)\b", text_lower)
        if m_alt:
            return f"zone_{m_alt.group(1).upper()}"

        return None


if __name__ == "__main__":
    import argparse
    import json

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="CrowdShield Voice Command Processor CLI")
    parser.add_argument("--file", type=str, help="Path to input audio file")
    parser.add_argument("--record", type=int, help="Record audio from microphone for N seconds")
    args = parser.parse_args()

    processor = VoiceCommandProcessor()

    if args.record:
        print(f"Recording {args.record} seconds from microphone...")
        try:
            import sounddevice as sd
            import numpy as np
            from scipy.io.wavfile import write as wav_write

            sample_rate = 16000
            recording = sd.rec(int(args.record * sample_rate), samplerate=sample_rate, channels=1, dtype='int16')
            sd.wait()
            temp_path = "temp_recording.wav"
            wav_write(temp_path, sample_rate, recording)
            print("Recording finished. Processing voice command...")
            res = processor.process_voice_command(temp_path)
            print(json.dumps(res, indent=2))
        except Exception as exc:
            print(f"Microphone recording failed or not available ({exc}). Specify an audio file with --file.")
    elif args.file:
        print(f"Processing audio file: {args.file}")
        res = processor.process_voice_command(args.file)
        print(json.dumps(res, indent=2))
    else:
        print("No --file or --record flag passed. Testing intent matcher on text examples:")
        test_phrases = [
            "show me zone A1",
            "what is the current risk level",
            "what's the risk in zone A1",
            "broadcast evacuation alert to all zones",
            "close gate 3",
            "what is the weather today",
        ]
        for phrase in test_phrases:
            matched = processor.match_intent(phrase)
            print(f"Text: '{phrase}' -> {matched}")
