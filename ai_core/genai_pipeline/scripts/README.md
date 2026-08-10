# genai_pipeline / scripts

Will contain the Phase 3 generative AI modules:

- `llm_client.py` — `LLMClient` (Gemini/Claude JSON-mode abstraction, retry/backoff).
- `recommendation_engine.py` — `RecommendationEngine` (tactical interventions).
- `incident_summary.py` — `IncidentSummaryGenerator` (post-incident reports).
- `translation_tts.py` — `MultilingualAnnouncer` (translation + Edge-TTS/gTTS).
- `sentiment_analysis.py` — `SentimentAnalyzer` (mocked social posts + scoring).
- `voice_commands.py` — `VoiceCommandProcessor` (Faster-Whisper STT + intent matching).
- `pipeline.py` — `GenAIPipeline` orchestrator with subcommand CLI.

**Status:** Scaffolding only — no logic implemented yet.
