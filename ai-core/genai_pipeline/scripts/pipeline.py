#!/usr/bin/env python3
"""
pipeline.py — CrowdShield GenAI Pipeline | Batch 8: Orchestrator & CLI

Unified pipeline orchestrator binding all Phase 3 Generative AI modules together:
- RecommendationEngine
- IncidentSummaryGenerator
- MultilingualAnnouncer
- SentimentAnalyzer
- VoiceCommandProcessor
- VoiceQueryResponder

Provides high-level Python API and a rich CLI interface.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

# Ensure script directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
GENAI_PIPELINE_DIR = SCRIPT_DIR.parent
DEFAULT_FIXTURE_PATH = GENAI_PIPELINE_DIR / "fixtures" / "phase2_sample_output.json"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
    from recommendation_engine import RecommendationEngine
    from incident_summary import IncidentSummaryGenerator
    from translation_tts import MultilingualAnnouncer
    from sentiment_analysis import SentimentAnalyzer, generate_mock_social_posts
    from voice_commands import VoiceCommandProcessor
    from voice_query_responder import VoiceQueryResponder
except ImportError as _exc:
    # Direct import attempt for relative context
    try:
        from .llm_client import LLMClient, LLMClientError
        from .recommendation_engine import RecommendationEngine
        from .incident_summary import IncidentSummaryGenerator
        from .translation_tts import MultilingualAnnouncer
        from .sentiment_analysis import SentimentAnalyzer, generate_mock_social_posts
        from .voice_commands import VoiceCommandProcessor
        from .voice_query_responder import VoiceQueryResponder
    except ImportError:
        raise ImportError(f"Failed to import required genai_pipeline modules: {_exc}") from _exc

logger = logging.getLogger("genai_pipeline")


class GenAIPipeline:
    """
    Unified Generative AI Pipeline for CrowdShield.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        try:
            self.client = llm_client or LLMClient()
        except Exception as exc:
            logger.warning("LLMClient init error: %s. Modules will rely on local fallbacks.", exc)
            self.client = None

        self.recommendation_engine = RecommendationEngine(llm_client=self.client)
        self.summary_generator = IncidentSummaryGenerator(llm_client=self.client)
        self.announcer = MultilingualAnnouncer(llm_client=self.client)
        self.sentiment_analyzer = SentimentAnalyzer(llm_client=self.client)
        self.voice_processor = VoiceCommandProcessor()
        self.voice_responder = VoiceQueryResponder(
            llm_client=self.client, announcer=self.announcer
        )

    def recommend(
        self,
        zone_risk_data: dict[str, Any],
        neighbor_zones_data: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Generate tactical recommendations for a target zone."""
        try:
            return self.recommendation_engine.generate_recommendations(
                zone_risk_data, neighbor_zones_data
            )
        except Exception as exc:
            logger.error("Recommend error: %s", exc)
            z_id = zone_risk_data.get("zone_id", "unknown")
            return {
                "zone_id": z_id,
                "risk_level": zone_risk_data.get("risk_level", "unknown"),
                "recommendations": [
                    {
                        "action": "Increase monitoring of this zone",
                        "category": "crowd_control",
                        "urgency": "soon",
                        "reasoning": "Fallback recommendation due to pipeline execution error.",
                    }
                ],
                "generated_at": "",
            }

    def summarize(
        self,
        zone_id: str,
        time_series_data: list[dict[str, Any]],
        resolution_status: str = "resolved",
    ) -> dict[str, Any]:
        """Generate executive post-incident summary."""
        try:
            return self.summary_generator.generate_summary(
                zone_id, time_series_data, resolution_status=resolution_status
            )
        except Exception as exc:
            logger.error("Summarize error: %s", exc)
            return {
                "zone_id": zone_id,
                "peak_risk_score": 0.0,
                "duration_at_risk_seconds": 0,
                "likely_cause": "System fallback due to pipeline processing error.",
                "narrative_summary": f"Incident summary for {zone_id} encountered an processing exception.",
                "resolution_status": resolution_status,
                "generated_at": "",
            }

    async def announce(
        self,
        base_message_en: str,
        target_languages: list[str] | None = None,
        output_dir: str = "ai-core/genai_pipeline/audio_output/",
    ) -> dict[str, Any]:
        """Generate multilingual translations, speech audio, and social dispatch payloads."""
        try:
            alert = await self.announcer.create_multilingual_alert(
                base_message_en, target_languages=target_languages, output_dir=output_dir
            )
            social = self.announcer.format_for_social_channels(alert)
            alert["social_dispatches"] = social.get("dispatches", [])
            return alert
        except Exception as exc:
            logger.error("Announce error: %s", exc)
            return {
                "base_message_en": base_message_en,
                "translations": {},
                "social_dispatches": [],
                "error": str(exc),
            }

    def analyze_sentiment(
        self, posts: list[dict[str, str]] | None = None
    ) -> dict[str, Any]:
        """Analyze batch social media posts for unrest score and high-urgency flags."""
        try:
            if posts is None:
                posts = generate_mock_social_posts()
            return self.sentiment_analyzer.analyze_posts(posts)
        except Exception as exc:
            logger.error("Sentiment error: %s", exc)
            return {
                "analyzed_at": "",
                "posts_analyzed": len(posts) if posts else 0,
                "aggregated_unrest_score": 0.0,
                "flagged_posts": [],
                "error": str(exc),
            }

    def process_voice(
        self,
        audio_file_path: str | None = None,
        command_text: str | None = None,
        current_zone_risk_data: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Process voice command audio or text and generate control room intent + response."""
        try:
            if audio_file_path:
                result = self.voice_processor.process_voice_command(audio_file_path)
            elif command_text:
                matched = self.voice_processor.match_intent(command_text)
                result = {
                    "transcribed_text": command_text,
                    "matched_intent": matched["matched_intent"],
                    "intent_params": matched["intent_params"],
                    "confidence": matched["confidence"],
                }
            else:
                return {"error": "Must provide either audio_file_path or command_text"}

            if current_zone_risk_data:
                spoken_response = self.voice_responder.answer_query(
                    result["matched_intent"],
                    result["intent_params"],
                    current_zone_risk_data,
                )
                result["responder_answer"] = spoken_response.get("answer_text")

            return result
        except Exception as exc:
            logger.error("Voice processing error: %s", exc)
            return {
                "transcribed_text": command_text or "",
                "matched_intent": "unrecognized",
                "intent_params": {},
                "confidence": "low",
                "error": str(exc),
            }


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="CrowdShield GenAI Pipeline Orchestration CLI"
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to execute")

    # Recommend subcommand
    p_rec = subparsers.add_parser("recommend", help="Generate tactical recommendations")
    p_rec.add_argument(
        "--input",
        type=str,
        default=str(DEFAULT_FIXTURE_PATH),
        help="Path to Phase 2 RiskEngine JSON output file",
    )
    p_rec.add_argument("--zone-id", type=str, help="Specific zone_id to analyze")

    # Summarize subcommand
    p_sum = subparsers.add_parser("summarize", help="Generate post-incident summary")
    p_sum.add_argument(
        "--input",
        type=str,
        default=str(DEFAULT_FIXTURE_PATH),
        help="Path to Phase 2 JSON or time-series file",
    )
    p_sum.add_argument("--zone-id", type=str, default="zone_A1", help="Target zone_id")

    # Announce subcommand
    p_ann = subparsers.add_parser("announce", help="Generate multilingual announcement & TTS")
    p_ann.add_argument(
        "--message",
        type=str,
        default="Please move calmly toward Exit B. Avoid Zone A1.",
        help="Base English announcement text",
    )
    p_ann.add_argument(
        "--langs",
        nargs="+",
        default=["hi", "ta", "te", "bn", "mr"],
        help="Target language codes",
    )

    # Sentiment subcommand
    p_sent = subparsers.add_parser("sentiment", help="Analyze social media sentiment")
    p_sent.add_argument("--input", type=str, help="Path to custom posts JSON file")
    p_sent.add_argument(
        "--mock", action="store_true", default=True, help="Use mock social posts"
    )

    # Voice subcommand
    p_vce = subparsers.add_parser("voice", help="Process voice command audio or text")
    p_vce.add_argument("--file", type=str, help="Path to input audio file")
    p_vce.add_argument("--text", type=str, help="Direct command text string")
    p_vce.add_argument(
        "--risk-data", type=str, help="Path to live risk data JSON file for query answering"
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    pipeline = GenAIPipeline()

    # Execute subcommands
    if args.command == "recommend":
        filepath = Path(args.input)
        if not filepath.exists():
            print(json.dumps({"error": f"Input file not found: {filepath}"}))
            sys.exit(1)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        zones = data.get("zones", []) if isinstance(data, dict) else data
        target = None
        neighbors = []

        if args.zone_id:
            for z in zones:
                if z.get("zone_id") == args.zone_id:
                    target = z
                else:
                    neighbors.append(z)
        else:
            for z in zones:
                if target is None and z.get("risk_level") in ("high", "critical"):
                    target = z
                else:
                    neighbors.append(z)

        if not target and zones:
            target = zones[0]
            neighbors = zones[1:]

        res = pipeline.recommend(target or {}, neighbor_zones_data=neighbors)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.command == "summarize":
        filepath = Path(args.input)
        if not filepath.exists():
            print(json.dumps({"error": f"Input file not found: {filepath}"}))
            sys.exit(1)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Build dummy time series if single frame provided
        zones = data.get("zones", []) if isinstance(data, dict) else data
        target_series = [z for z in zones if z.get("zone_id") == args.zone_id]
        if not target_series and zones:
            target_series = [zones[0]]

        res = pipeline.summarize(args.zone_id, target_series)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.command == "announce":

        async def run_announcement():
            res = await pipeline.announce(args.message, target_languages=args.langs)
            print(json.dumps(res, indent=2, ensure_ascii=False))

        asyncio.run(run_announcement())

    elif args.command == "sentiment":
        posts = None
        if args.input:
            p_path = Path(args.input)
            if p_path.exists():
                with open(p_path, "r", encoding="utf-8") as f:
                    posts = json.load(f)

        res = pipeline.analyze_sentiment(posts)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.command == "voice":
        risk_data = None
        if args.risk_data:
            r_path = Path(args.risk_data)
            if r_path.exists():
                with open(r_path, "r", encoding="utf-8") as f:
                    r_raw = json.load(f)
                    risk_data = r_raw.get("zones", []) if isinstance(r_raw, dict) else r_raw

        res = pipeline.process_voice(
            audio_file_path=args.file,
            command_text=args.text,
            current_zone_risk_data=risk_data,
        )
        print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
