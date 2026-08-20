#!/usr/bin/env python3
"""
translation_tts.py — CrowdShield GenAI Pipeline | Batch 4: Multilingual Announcement & TTS

Translates base English public safety alert messages into regional Indian languages
(hi, ta, te, bn, mr) using LLMClient, generates speech audio using Edge-TTS (with gTTS fallback),
and formats simulated payloads for social dispatch channels (X, Instagram).
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import sys
from pathlib import Path
from typing import Any

# Ensure script directory is in sys.path for local imports
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from llm_client import LLMClient, LLMClientError
except ImportError:
    from .llm_client import LLMClient, LLMClientError

try:
    import edge_tts
except ImportError:
    edge_tts = None

try:
    from gtts import gTTS
except ImportError:
    gTTS = None

logger = logging.getLogger(__name__)

# Map language codes to human-readable names
LANGUAGE_NAMES: dict[str, str] = {
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "mr": "Marathi",
    "en": "English",
}

# Map language codes to edge-tts neural voice identifiers
EDGE_TTS_VOICES: dict[str, str] = {
    "hi": "hi-IN-MadhurNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-MohanNeural",
    "bn": "bn-IN-BashkarNeural",
    "mr": "mr-IN-AarohiNeural",
    "en": "en-IN-NeerjaNeural",
}

# Reference examples only. Runtime fallbacks use the operator's message so a
# failed translation cannot synthesize an unrelated demo announcement.
FALLBACK_TRANSLATIONS: dict[str, str] = {
    "hi": "कृपया शांति से निकास बी की ओर बढ़ें। ज़ोन ए1 से बचें।",
    "ta": "தயவுசெய்து அமைதியாக வெளியேறும் பி நோக்கி செல்லவும். மண்டலம் ஏ1 ஐத் தவிர்க்கவும்.",
    "te": "దయచేసి ప్రశాంతంగా నిష్క్రమణ B వైపు వెళ్లండి. జోన్ A1కి దూరంగా ఉండండి.",
    "bn": "অনুগ্রহ করে শান্তভাবে এক্সিট বি-এর দিকে যান। জোন এ১ এড়িয়ে চলুন।",
    "mr": "कृपया शांतपणे एक्झिट बी कडे जा. झोन ए१ टाळा.",
}


class MultilingualAnnouncer:
    """
    Handles translation of public safety alerts, audio synthesis (TTS),
    and social broadcast formatting.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.client = llm_client or LLMClient()

    def translate_message(
        self,
        base_message_en: str,
        target_languages: list[str] | None = None,
    ) -> dict[str, str]:
        """
        Translate a base English alert message into target regional languages.

        Parameters
        ----------
        base_message_en : str
            English announcement text.
        target_languages : list[str] | None
            List of language codes (default: ["hi", "ta", "te", "bn", "mr"]).

        Returns
        -------
        dict[str, str]
            Dict mapping language code -> translated string.
        """
        if target_languages is None:
            target_languages = ["hi", "ta", "te", "bn", "mr"]

        lang_specs = [
            f"'{lang}': {LANGUAGE_NAMES.get(lang, lang)}" for lang in target_languages
        ]
        prompt = (
            f"You are a public safety translator for an emergency broadcast system.\n"
            f"Base English Announcement:\n\"{base_message_en}\"\n\n"
            f"Translate this message accurately into the following regional languages:\n"
            + "\n".join(f"- {spec}" for spec in lang_specs)
            + "\n\nInstructions:\n"
            "1. Keep each translation clear, concise, calm, and suitable for a public address system.\n"
            "2. Preserve the urgency and safety instructions without adding extra information.\n"
            "3. Return JSON mapping language code to translated string.\n\n"
            f'Return JSON: {{{", ".join(f"{lang}: str" for lang in target_languages)}}}'
        )

        schema_hint = f'{{{", ".join(f"{lang}: str" for lang in target_languages)}}}'

        try:
            raw_response = self.client.generate_json(prompt, schema_hint)
            validated = {}
            if isinstance(raw_response, dict):
                for lang in target_languages:
                    text = raw_response.get(lang)
                    if text and isinstance(text, str) and text.strip():
                        validated[lang] = text.strip()

            if len(validated) == len(target_languages):
                return validated

            logger.warning(
                "Partial translation response received. Filling missing languages with local fallbacks."
            )
            for lang in target_languages:
                if lang not in validated:
                    validated[lang] = base_message_en
            return validated

        except Exception as exc:
            logger.warning(
                "Translation failed: %s. Speaking the operator-authored message as fallback.", exc
            )
            return {lang: base_message_en for lang in target_languages}

    async def generate_audio(
        self,
        translated_text: str,
        language_code: str,
        output_dir: str = "ai_core/genai_pipeline/audio_output/",
    ) -> str:
        """
        Synthesize speech from text using Edge-TTS (with gTTS fallback).

        Parameters
        ----------
        translated_text : str
            Text string to synthesize.
        language_code : str
            Target language code (e.g. 'hi', 'ta').
        output_dir : str
            Directory path to save the generated MP3 file.

        Returns
        -------
        str
            Path to the generated audio file.
        """
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
        filename = f"alert_{language_code}_{timestamp_str}.mp3"
        filepath = out_path / filename

        # 1. Try Edge-TTS (preferred)
        voice = EDGE_TTS_VOICES.get(language_code, "hi-IN-MadhurNeural")
        saved = False
        if edge_tts is not None:
            try:
                communicate = edge_tts.Communicate(translated_text, voice)
                await asyncio.wait_for(communicate.save(str(filepath)), timeout=15.0)
                logger.info("Generated Edge-TTS audio: %s", filepath)
                saved = True
            except Exception as exc:
                logger.warning(
                    "Edge-TTS failed or timed out for language %s (%s). Attempting gTTS fallback...",
                    language_code,
                    exc,
                )

        # 2. Fallback to gTTS if Edge-TTS fails or is unavailable
        if not saved and gTTS is not None:
            try:
                loop = asyncio.get_running_loop()
                tts = gTTS(text=translated_text, lang=language_code)
                await asyncio.wait_for(loop.run_in_executor(None, tts.save, str(filepath)), timeout=15.0)
                logger.info("Generated gTTS audio fallback: %s", filepath)
                saved = True
            except Exception as exc:
                logger.error("gTTS fallback also failed for %s: %s", language_code, exc)

        # 3. No playable file available. Return an empty path so clients can
        # fall back to browser speech synthesis instead of trying to play a
        # zero-byte placeholder file.
        if not saved:
            logger.error(
                "No TTS provider could generate audio for language %s; returning no audio path.",
                language_code,
            )
            try:
                filepath.unlink(missing_ok=True)
            except OSError:
                pass
            return ""

        # Sync copy to alternate audio_output paths
        import shutil
        for alt in [
            Path("ai_core/genai_pipeline/audio_output"),
            Path("backend/ai_core/genai_pipeline/audio_output"),
            Path(__file__).resolve().parent.parent / "audio_output",
        ]:
            try:
                if alt.resolve() != out_path.resolve():
                    alt.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(filepath, alt / filename)
            except Exception:
                pass

        return f"ai_core/genai_pipeline/audio_output/{filename}"

    async def create_multilingual_alert(
        self,
        base_message_en: str,
        target_languages: list[str] | None = None,
        output_dir: str = "ai_core/genai_pipeline/audio_output/",
    ) -> dict[str, Any]:
        """
        Orchestrate translation and async audio generation concurrently.

        Returns dict matching Phase 3 deliverable schema:
        {
          "base_message_en": "Please move calmly toward Exit B. Avoid Zone A1.",
          "translations": {
            "hi": {"text": "...", "audio_path": "..."},
            "ta": {"text": "...", "audio_path": "..."}
          },
          "generated_at": "2026-08-03T14:32:20Z"
        }
        """
        if target_languages is None:
            target_languages = ["hi", "ta", "te", "bn", "mr"]

        now_iso = (
            datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        )

        # Step 1: Translate text in thread with strict timeout to avoid blocking
        try:
            translations_text = await asyncio.wait_for(
                asyncio.to_thread(self.translate_message, base_message_en, target_languages),
                timeout=20.0,
            )
        except Exception as exc:
            logger.warning("Translation timed out or failed: %s. Speaking the operator-authored message as fallback.", exc)
            translations_text = {lang: base_message_en for lang in target_languages}

        # Step 2: Generate audio concurrently for all target languages
        async def process_lang(lang: str):
            text = translations_text.get(lang, base_message_en)
            audio_path = await self.generate_audio(text, lang, output_dir=output_dir)
            return lang, {"text": text, "audio_path": audio_path}

        tasks = [process_lang(lang) for lang in target_languages]
        results = await asyncio.gather(*tasks)

        translations_dict = {lang: data for lang, data in results}

        return {
            "base_message_en": base_message_en,
            "translations": translations_dict,
            "generated_at": now_iso,
        }

    def format_for_social_channels(
        self,
        multilingual_alert: dict[str, Any],
        platforms: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        SIMULATED social dispatch formatter.

        Formats alert messages for platforms such as X (280 char limit) and Instagram.
        NOTE: Real social posting is out of scope for hackathon; this formats
        the payloads for simulated dispatch.
        """
        if platforms is None:
            platforms = ["X", "Instagram"]

        base_en = multilingual_alert.get("base_message_en", "")
        translations = multilingual_alert.get("translations", {})
        hi_text = translations.get("hi", {}).get("text", "")

        now_iso = (
            datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        dispatches = []

        for platform in platforms:
            if platform.upper() in ("X", "TWITTER"):
                prefix = "🚨 CROWD SAFETY ALERT: "
                formatted = f"{prefix}{base_en}"
                if hi_text and len(formatted) + len(hi_text) + 6 <= 280:
                    formatted += f"\n\n[HI] {hi_text}"
                formatted = formatted[:280]

            elif platform.title() in ("Instagram", "Ig"):
                lines = [
                    "🚨 OFFICIAL CROWD SAFETY ANNOUNCEMENT 🚨",
                    "",
                    f"English: {base_en}",
                ]
                for lang_code, item in translations.items():
                    lang_name = LANGUAGE_NAMES.get(lang_code, lang_code.upper())
                    txt = item.get("text")
                    if txt:
                        lines.append(f"{lang_name}: {txt}")
                lines.extend(
                    [
                        "",
                        "#CrowdSafety #EventControl #PublicSafety #EmergencyNotice",
                    ]
                )
                formatted = "\n".join(lines)
            else:
                formatted = f"[ALERT] {base_en}"

            dispatches.append(
                {
                    "platform": platform,
                    "formatted_text": formatted,
                    "status": "simulated_post",
                }
            )

        return {
            "dispatches": dispatches,
            "dispatched_at": now_iso,
        }


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)

    print("=" * 60)
    print("  CrowdShield MultilingualAnnouncer — Standalone Check")
    print("=" * 60)

    announcer = MultilingualAnnouncer()
    test_msg = "Please move calmly toward Exit B. Avoid Zone A1."

    async def main_check():
        alert = await announcer.create_multilingual_alert(test_msg, ["hi", "ta"])
        print("\n  [OK] Multilingual Alert Created:\n")
        print(json.dumps(alert, indent=2, ensure_ascii=False))

        social = announcer.format_for_social_channels(alert)
        print("\n  [OK] Simulated Social Dispatches:\n")
        print(json.dumps(social, indent=2, ensure_ascii=False))

    asyncio.run(main_check())
