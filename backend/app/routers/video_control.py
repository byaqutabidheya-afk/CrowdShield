"""
Processing & Video Control Router for CrowdShield Backend.

Provides endpoints to start/stop the live video processing orchestrator loop,
upload video files for CV processing, and query rich processing status.
# Forced reload for ai_core updates
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, Form, UploadFile, status
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
    video_source: str = Field(..., description="Video file path, filename, or camera index '0'")
    zones_config: Optional[List[Dict[str, Any]]] = Field(
        None, description="Optional list of zone configurations"
    )
    venue_id: str = Field("cam_01", description="Venue or stream identifier")
    sample_every_n_frames: int = Field(3, gt=0, description="Sampling rate")


async def _stop_current_task() -> None:
    """
    Cancel the active processing task and wait for it to fully stop before returning.
    This prevents the old CVPipeline from racing against the new one on the same file.
    """
    global _current_processing_task

    if _current_processing_task and not _current_processing_task.done():
        logger.info(f"Cancelling active processing task for session '{_current_session_id}'.")
        _current_processing_task.cancel()
        try:
            await _current_processing_task
        except (asyncio.CancelledError, Exception):
            pass  # Expected — task was cancelled
        _current_processing_task = None

    # Reset orchestrator state so counters and alert history are fresh for next session
    orchestrator.is_processing = False
    orchestrator.frames_processed = 0
    orchestrator.max_risk_score_seen = 0.0
    orchestrator.active_alerts.clear()
    orchestrator.previous_zone_risk_levels.clear()


def _resolve_zones(zones_config: Optional[List[Dict[str, Any]]], venue_id: str) -> List[Dict[str, Any]]:
    """Fetch zones from Supabase or fall back to a 2×2 grid."""
    zones = zones_config
    if not zones:
        from app.services import supabase_client
        zones = supabase_client.get_zone_config(venue_id=venue_id)
    if not zones:
        from ai_core.shared.zone_config import generate_grid_zones
        zones = [z.to_dict() for z in generate_grid_zones(2, 2)]
    return zones


@router.post(
    "/start",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Start live video processing loop",
)
async def start_processing(payload: StartProcessingRequest) -> Dict[str, Any]:
    """
    Launches `EventOrchestrator.run_live_processing` as a background asyncio task.
    Resolves video filenames against demo/videos/ directory if needed.
    Cancels and fully awaits any previously running task before starting the new one.
    """
    global _current_processing_task, _current_session_id

    await _stop_current_task()

    video_src = payload.video_source
    if video_src != "0":
        src_path = Path(video_src)
        if not src_path.exists():
            alt1 = Path("demo/videos") / video_src
            alt2 = Path("demo/videos/uploads") / video_src
            alt3 = Path("../ai_core/cv_pipeline/sample_videos") / video_src
            alt4 = Path("ai_core/cv_pipeline/sample_videos") / video_src
            if alt1.exists():
                video_src = str(alt1.absolute())
            elif alt2.exists():
                video_src = str(alt2.absolute())
            elif alt3.exists():
                video_src = str(alt3.absolute())
            elif alt4.exists():
                video_src = str(alt4.absolute())

    zones = _resolve_zones(payload.zones_config, payload.venue_id)
    _current_session_id = f"session_{uuid.uuid4().hex[:8]}"

    logger.info(
        f"Starting background processing task session '{_current_session_id}' for video '{video_src}'..."
    )

    _current_processing_task = asyncio.create_task(
        orchestrator.run_live_processing(
            video_source=video_src,
            zones=zones,
            venue_id=payload.venue_id,
            websocket_manager=websocket_manager,
            sample_every_n_frames=payload.sample_every_n_frames,
        )
    )

    return {
        "status": "started",
        "session_id": _current_session_id,
        "video_source": video_src,
        "venue_id": payload.venue_id,
    }


@router.post(
    "/upload",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Upload video file and launch Python CV Pipeline processing",
)
async def upload_and_start_processing(
    file: UploadFile = File(...),
    venue_id: str = Form("cam_01"),
    sample_every_n_frames: int = Form(3),
) -> Dict[str, Any]:
    """
    Saves uploaded video file to demo/videos/uploads/ and launches EventOrchestrator.run_live_processing.
    Cancels and fully awaits any previously running task before starting the new one.
    """
    global _current_processing_task, _current_session_id

    await _stop_current_task()

    # Ensure uploads directory exists and save the file
    upload_dir = Path("demo/videos/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    logger.info(f"Saved uploaded video file ({len(content)} bytes) to '{file_path.absolute()}'. Starting CV Pipeline...")

    zones = _resolve_zones(None, venue_id)
    _current_session_id = f"session_{uuid.uuid4().hex[:8]}"

    _current_processing_task = asyncio.create_task(
        orchestrator.run_live_processing(
            video_source=str(file_path.absolute()),
            zones=zones,
            venue_id=venue_id,
            websocket_manager=websocket_manager,
            sample_every_n_frames=sample_every_n_frames,
        )
    )

    return {
        "status": "started",
        "session_id": _current_session_id,
        "video_source": file.filename,
        "saved_path": str(file_path.absolute()),
        "venue_id": venue_id,
    }


@router.post(
    "/stop",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Stop live video processing loop",
)
async def stop_processing() -> Dict[str, Any]:
    """
    Stops the currently running background processing task and resets orchestrator state.
    """
    session = _current_session_id
    await _stop_current_task()
    return {"status": "stopped", "session_id": session}


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
