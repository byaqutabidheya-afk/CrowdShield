"""
Operator Voice Commands Router for CrowdShield Backend.

Provides speech-to-text transcription and intent classification for operator voice controls.
"""

import os
import tempfile
import logging
from pathlib import Path
from typing import Any, Dict
from fastapi import APIRouter, File, UploadFile, status

from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice-command", tags=["Voice Controls"])

# Initialize GenAI Pipeline instance
genai_pipeline = GenAIPipeline()


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Process operator voice command audio",
)
async def process_voice_command(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Uploads an audio recording (.wav, .mp3, etc.), transcribes it via faster-whisper,
    and maps it to a control room intent.
    """
    logger.info(f"Processing uploaded voice command file '{file.filename}'.")

    # Create a temporary file to store the uploaded audio bytes
    suffix = Path(file.filename or "command.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        temp_path = temp_audio.name
        content = await file.read()
        temp_audio.write(content)

    try:
        # Run STT & intent matching
        intent_result = genai_pipeline.voice_processor.process_voice_command(temp_path)
        logger.info(f"Voice command intent matched: {intent_result.get('matched_intent')}")
        return intent_result
    except Exception as e:
        logger.warning(f"Voice command processing error or fallback: {e}")
        # Return structured fallback intent so dev mode / missing whisper binary doesn't crash app
        return {
            "transcribed_text": "show me zone A1",
            "matched_intent": "navigate_to_zone",
            "intent_params": {"zone_id": "zone_A1"},
            "confidence": "fallback",
            "note": "Fallback intent returned due to transcription environment limitation.",
        }
    finally:
        # Guarantee cleanup of temporary audio file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as cleanup_err:
                logger.warning(f"Failed to remove temp audio file '{temp_path}': {cleanup_err}")
