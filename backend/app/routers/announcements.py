"""
Multilingual Announcements & Social Communication Router for CrowdShield Backend.

Provides endpoints for generating translated alerts, TTS speech audio files,
and multi-channel social dispatches (X, Instagram, Mobile Push).
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

# Initialize GenAI Pipeline instance
genai_pipeline = GenAIPipeline()


class AnnouncementRequest(BaseModel):
    base_message_en: str = Field(..., description="English base safety message")
    target_languages: Optional[List[str]] = Field(
        None, description="Target language codes (default: ['hi', 'ta', 'te', 'bn', 'mr'])"
    )
    zone_id: Optional[str] = Field(None, description="Optional zone ID triggering announcement")
    post_to_social: bool = Field(True, description="Whether to format simulated social dispatches")


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Create multilingual safety announcements and social dispatches",
)
async def create_announcement(payload: AnnouncementRequest) -> Dict[str, Any]:
    """
    Translates base English safety alert into regional languages, generates TTS audio,
    formats simulated social platform dispatches, and logs an intervention audit trail.
    """
    logger.info(
        f"Creating announcement for zone '{payload.zone_id}': '{payload.base_message_en}'"
    )

    target_langs = payload.target_languages or ["hi", "ta", "te", "bn", "mr"]

    # Generate translations + TTS audio paths via GenAI MultilingualAnnouncer
    alert_result = await genai_pipeline.announcer.create_multilingual_alert(
        base_message_en=payload.base_message_en,
        target_languages=target_langs,
    )

    # Format social channels if requested
    social_dispatches = {}
    if payload.post_to_social:
        social_formatting = genai_pipeline.announcer.format_for_social_channels(
            alert_result, platforms=["X", "Instagram", "Telegram"]
        )
        social_dispatches = social_formatting.get("dispatches", {})

    alert_result["social_channels"] = social_dispatches
    alert_result["zone_id"] = payload.zone_id or "global"

    # Log audit trail into interventions table
    channels = ["mobile_push"]
    if payload.post_to_social:
        channels.extend(["X", "Instagram", "Telegram"])

    intervention_data = {
        "zone_id": payload.zone_id or "global",
        "action_taken": f"Announcement: {payload.base_message_en} (Channels: {', '.join(channels)})",
        "category": "communication",
        "triggered_by": "operator",
        "channels": channels,
    }
    supabase_client.insert_intervention(intervention_data)

    return alert_result
