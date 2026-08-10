"""
Processing & Video Control Router for CrowdShield Backend.

Provides endpoints to start/stop the live video processing orchestrator loop
and query rich processing status for presentation demo runners and command dashboards.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.services.orchestrator import EventOrchestrator
from app.websockets.manager import manager as websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/processing", tags=["Video Processing Control"])

# Global orchestrator instance and active task reference
orchestrator = EventOrchestrator()
_current_processing_task: Optional[asyncio.Task] = None
_current_session_id: Optional[str] = None


class StartProcessingRequest(BaseModel):
    video_source: str = Field(..., description="Video file path or RTSP stream URL")
    zones_config: Optional[List[Dict[str, Any]]] = Field(
        None, description="Optional list of zone configurations"
    )
    venue_id: str = Field("cam_01", description="Venue or stream identifier")
    sample_every_n_frames: int = Field(3, gt=0, description="Sampling rate")


@router.post(
    "/start",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Start live video processing loop",
)
async def start_processing(payload: StartProcessingRequest) -> Dict[str, Any]:
    """
    Launches `EventOrchestrator.run_live_processing` as a background asyncio task.
    Passes venue_id through so it looks up venue-specific diffusion tuning overrides.
    """
    global _current_processing_task, _current_session_id

    if orchestrator.is_processing:
        logger.warning("Processing loop is already active.")
        return {
            "status": "already_running",
            "session_id": _current_session_id,
            "venue_id": payload.venue_id,
        }

    # Fetch zones config from Supabase if not provided in request payload
    zones = payload.zones_config
    if not zones:
        from app.services import supabase_client

        zones = supabase_client.get_zone_config(venue_id=payload.venue_id)

    # Fallback to default 2x2 grid if no zones found
    if not zones:
        from ai_core.shared.zone_config import generate_grid_zones

        zones = [z.to_dict() for z in generate_grid_zones(2, 2)]

    _current_session_id = f"session_{uuid.uuid4().hex[:8]}"

    logger.info(
        f"Starting background processing task session '{_current_session_id}' for video '{payload.video_source}'..."
    )

    _current_processing_task = asyncio.create_task(
        orchestrator.run_live_processing(
            video_source=payload.video_source,
            zones=zones,
            venue_id=payload.venue_id,
            websocket_manager=websocket_manager,
            sample_every_n_frames=payload.sample_every_n_frames,
        )
    )

    return {
        "status": "started",
        "session_id": _current_session_id,
        "venue_id": payload.venue_id,
    }


@router.post(
    "/stop",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Stop live video processing loop",
)
async def stop_processing() -> Dict[str, Any]:
    """
    Stops the currently running background processing task.
    """
    global _current_processing_task, _current_session_id

    if _current_processing_task and not _current_processing_task.done():
        logger.info(f"Cancelling active processing task for session '{_current_session_id}'.")
        _current_processing_task.cancel()
        _current_processing_task = None
        orchestrator.is_processing = False

    return {"status": "stopped", "session_id": _current_session_id}


@router.get(
    "/status",
    response_model=Dict[str, Any],
    summary="Get live processing status and presenter metrics",
)
async def get_processing_status() -> Dict[str, Any]:
    """
    Returns live processing status, frames processed, elapsed seconds, max risk score seen,
    active alert count, and active alerts summary for demo_runner.py terminal presenter dashboard.
    """
    elapsed = 0.0
    if orchestrator.is_processing and orchestrator.start_time:
        elapsed = round(
            (datetime.now(timezone.utc) - orchestrator.start_time).total_seconds(), 1
        )

    active_alerts_list = [
        {"zone_id": z_id, "risk_level": orchestrator.previous_zone_risk_levels.get(z_id, "high")}
        for z_id in orchestrator.active_alerts.keys()
    ]

    return {
        "is_active": orchestrator.is_processing,
        "session_id": _current_session_id,
        "frames_processed": orchestrator.frames_processed,
        "elapsed_seconds": elapsed,
        "max_risk_score_seen": round(orchestrator.max_risk_score_seen, 3),
        "active_alert_count": len(orchestrator.active_alerts),
        "active_alerts": active_alerts_list,
    }
