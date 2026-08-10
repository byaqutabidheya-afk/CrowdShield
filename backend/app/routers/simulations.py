"""
Pre-Event Crowd Buildup Simulations Router for CrowdShield Backend.

Provides offline simulation endpoints for venue capacity planning and stress testing.
"""

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.orchestrator import EventOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulations", tags=["Simulations"])

# Orchestrator instance for pre-event simulation calls
orchestrator = EventOrchestrator()


class PreEventSimulationRequest(BaseModel):
    zones: List[Dict[str, Any]] = Field(..., description="List of zone configurations")
    entry_zone_ids: List[str] = Field(..., description="List of entry zone IDs")
    expected_attendance: int = Field(..., gt=0, description="Expected total headcount")
    arrival_duration_minutes: int = Field(30, gt=0, description="Arrival window duration in minutes")
    num_steps: int = Field(20, gt=0, description="Number of simulation timesteps")


@router.post(
    "/pre-event",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Run offline pre-event crowd buildup simulation",
)
async def run_pre_event_simulation(
    payload: PreEventSimulationRequest,
) -> Dict[str, Any]:
    """
    Executes offline pre-event simulation predicting crowd density buildup and bottlenecks.
    Returns full simulation step output matching Phase 2 PreEventSimulator schema.
    """
    logger.info(
        f"Received pre-event simulation request for {payload.expected_attendance} attendees "
        f"across {len(payload.zones)} zones."
    )
    try:
        result = await orchestrator.run_pre_event_simulation(
            zones=payload.zones,
            entry_zone_ids=payload.entry_zone_ids,
            expected_attendance=payload.expected_attendance,
            arrival_duration_minutes=payload.arrival_duration_minutes,
            num_steps=payload.num_steps,
        )
        return result
    except Exception as e:
        logger.error(f"Failed to execute pre-event simulation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation processing error: {str(e)}",
        )
