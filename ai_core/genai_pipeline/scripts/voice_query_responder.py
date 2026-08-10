#!/usr/bin/env python3
"""
voice_query_responder.py — CrowdShield GenAI Pipeline | Batch 7: Voice Query Responder

Generates natural-language spoken answers for voice query intents using LLMClient and
synthesizes voice audio responses using MultilingualAnnouncer.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
except ImportError:
    from .llm_client import LLMClient, LLMClientError

try:
    from translation_tts import MultilingualAnnouncer
except ImportError:
    from .translation_tts import MultilingualAnnouncer

logger = logging.getLogger(__name__)


class VoiceQueryResponder:
    """
    Formulates spoken responses to operator voice queries based on real-time risk data.
    """

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        announcer: MultilingualAnnouncer | None = None,
    ) -> None:
        self.client = llm_client or LLMClient()
        self.announcer = announcer or MultilingualAnnouncer(llm_client=self.client)

    def answer_query(
        self,
        matched_intent: str,
        intent_params: dict[str, Any],
        current_zone_risk_data: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Formulate a natural-language spoken answer for a matched intent.

        Parameters
        ----------
        matched_intent : str
            Intent label (e.g. 'query_risk_status', 'navigate_to_zone', 'close_gate').
        intent_params : dict
            Parameters extracted from intent matching (e.g. {'zone_id': 'zone_A1'}).
        current_zone_risk_data : list[dict]
            List of current zone risk dicts from RiskEngine output.

        Returns
        -------
        dict
            {"answer_text": str, "zone_id": str | None}
        """
        if not current_zone_risk_data:
            return {
                "answer_text": "No live zone risk data is currently available.",
                "zone_id": None,
            }

        target_zone_id = intent_params.get("zone_id")

        if matched_intent == "query_risk_status":
            if target_zone_id:
                # Query specific zone
                zone = self._find_zone_by_id(current_zone_risk_data, target_zone_id)
                if not zone:
                    return {
                        "answer_text": f"Zone {target_zone_id} was not found in the current venue map.",
                        "zone_id": target_zone_id,
                    }
                answer = self._generate_specific_zone_answer(zone)
                return {"answer_text": answer, "zone_id": zone.get("zone_id")}
            else:
                # Query highest-risk zone
                highest_zone = self._find_highest_risk_zone(current_zone_risk_data)
                answer = self._generate_highest_risk_answer(highest_zone)
                return {"answer_text": answer, "zone_id": highest_zone.get("zone_id")}

        elif matched_intent == "navigate_to_zone":
            z_id = target_zone_id or "requested zone"
            return {
                "answer_text": f"Navigating control room display to {z_id}.",
                "zone_id": target_zone_id,
            }

        elif matched_intent == "close_gate":
            gate = intent_params.get("gate_number", "specified")
            return {
                "answer_text": f"Initiating closure protocol for gate {gate}.",
                "zone_id": None,
            }

        elif matched_intent == "trigger_announcement":
            return {
                "answer_text": "Preparing public address announcement broadcast.",
                "zone_id": None,
            }

        else:
            return {
                "answer_text": "Command unrecognized. Please repeat your instruction.",
                "zone_id": None,
            }

    async def answer_to_speech(
        self,
        answer_text: str,
        language_code: str = "en",
        output_dir: str = "ai_core/genai_pipeline/audio_output/",
    ) -> str:
        """
        Synthesize speech audio from an answer string.

        Parameters
        ----------
        answer_text : str
            Spoken response string.
        language_code : str
            Language code (default 'en').
        output_dir : str
            Output audio directory.

        Returns
        -------
        str
            File path to synthesized MP3 audio.
        """
        return await self.announcer.generate_audio(
            answer_text, language_code, output_dir=output_dir
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_highest_risk_answer(self, zone: dict[str, Any]) -> str:
        zone_id = zone.get("zone_id", "A1")
        risk_score = zone.get("risk_score", 0.0)
        risk_level = zone.get("risk_level", "critical")
        dominant_factor = self._extract_dominant_factor(zone)

        fallback_str = (
            f"Zone {zone_id} currently has the highest risk at {risk_score:.2f}, "
            f"{risk_level} level, driven mainly by {dominant_factor}."
        )

        prompt = (
            f"Synthesize a concise 1-sentence spoken response for a control room operator.\n"
            f"Highest Risk Zone: {zone_id}\n"
            f"Risk Score: {risk_score:.2f}\n"
            f"Risk Level: {risk_level}\n"
            f"Dominant Factor: {dominant_factor}\n\n"
            f"Preserve all metrics ({zone_id}, {risk_score:.2f}, {risk_level}, {dominant_factor}) "
            f"in one clear, professional sentence.\n"
            f'Return JSON: {{"answer": "{fallback_str}"}}'
        )

        try:
            res = self.client.generate_json(prompt, '{"answer": str}')
            ans = res.get("answer")
            if ans and isinstance(ans, str) and len(ans.strip()) > 10:
                return ans.strip()
        except Exception as exc:
            logger.warning("LLM response generation failed: %s. Using template.", exc)

        return fallback_str

    def _generate_specific_zone_answer(self, zone: dict[str, Any]) -> str:
        zone_id = zone.get("zone_id", "A1")
        risk_score = zone.get("risk_score", 0.0)
        risk_level = zone.get("risk_level", "moderate")
        dominant_factor = self._extract_dominant_factor(zone)

        fallback_str = (
            f"Zone {zone_id} is currently at a {risk_level} risk level with a score of {risk_score:.2f}, "
            f"primarily influenced by {dominant_factor}."
        )

        prompt = (
            f"Synthesize a concise 1-sentence spoken response for a control room operator.\n"
            f"Zone ID: {zone_id}\n"
            f"Risk Score: {risk_score:.2f}\n"
            f"Risk Level: {risk_level}\n"
            f"Dominant Factor: {dominant_factor}\n\n"
            f"Include the metrics ({zone_id}, {risk_score:.2f}, {risk_level}) in one clear sentence.\n"
            f'Return JSON: {{"answer": "{fallback_str}"}}'
        )

        try:
            res = self.client.generate_json(prompt, '{"answer": str}')
            ans = res.get("answer")
            if ans and isinstance(ans, str) and len(ans.strip()) > 10:
                return ans.strip()
        except Exception as exc:
            logger.warning("LLM response generation failed: %s. Using template.", exc)

        return fallback_str

    @staticmethod
    def _find_highest_risk_zone(
        current_zone_risk_data: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return max(
            current_zone_risk_data,
            key=lambda z: float(z.get("risk_score", 0.0)),
            default=current_zone_risk_data[0],
        )

    @staticmethod
    def _find_zone_by_id(
        current_zone_risk_data: list[dict[str, Any]], zone_id: str
    ) -> dict[str, Any] | None:
        target_clean = zone_id.lower().replace("_", "").replace(" ", "")
        for z in current_zone_risk_data:
            z_clean = str(z.get("zone_id", "")).lower().replace("_", "").replace(" ", "")
            if z_clean == target_clean or target_clean in z_clean:
                return z
        return None

    @staticmethod
    def _extract_dominant_factor(zone: dict[str, Any]) -> str:
        factors = zone.get("contributing_factors", {})
        if not isinstance(factors, dict):
            return "high crowd density"

        numeric_factors = {
            k: float(v) for k, v in factors.items() if isinstance(v, (int, float))
        }

        if not numeric_factors:
            return "high crowd density"

        top_key = max(numeric_factors, key=numeric_factors.get)
        return top_key.replace("_score", "").replace("_indicator", "").replace("_", " ")


if __name__ == "__main__":
    import asyncio
    import json

    logging.basicConfig(level=logging.INFO)

    print("=" * 60)
    print("  CrowdShield VoiceQueryResponder — Standalone Check")
    print("=" * 60)

    sample_zones = [
        {
            "zone_id": "zone_A1",
            "risk_score": 0.82,
            "risk_level": "critical",
            "contributing_factors": {
                "density_score": 0.71,
                "flow_convergence_score": 0.90,
                "bottleneck_indicator": 1.0,
            },
        },
        {
            "zone_id": "zone_A2",
            "risk_score": 0.35,
            "risk_level": "moderate",
            "contributing_factors": {"density_score": 0.30},
        },
    ]

    responder = VoiceQueryResponder()

    # 1. Query highest risk
    res1 = responder.answer_query("query_risk_status", {}, sample_zones)
    print("\n  [OK] Highest Risk Answer:\n", json.dumps(res1, indent=2))

    # 2. Query specific zone
    res2 = responder.answer_query(
        "query_risk_status", {"zone_id": "zone_A2"}, sample_zones
    )
    print("\n  [OK] Specific Zone Answer:\n", json.dumps(res2, indent=2))

    # 3. Audio synthesis check
    async def test_audio():
        audio_path = await responder.answer_to_speech(res1["answer_text"])
        print(f"\n  [OK] Audio Generated: {audio_path}")

    asyncio.run(test_audio())
