"""
Zones & Safe-Route Navigation Router for CrowdShield Backend.

Provides endpoints for venue zone layout configuration and live route blockage predictions.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, status

from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Zones & Routes"])

# In-memory route blockage predictions cache: venue_id -> list of predictions
_route_predictions_cache: Dict[str, List[Dict[str, Any]]] = {}


def update_route_predictions_cache(venue_id: str, predictions: List[Dict[str, Any]]) -> None:
    """
    Updates the in-memory cache with the latest Phase 2 route blockage predictions.
    Called by EventOrchestrator on every frame.
    """
    _route_predictions_cache[venue_id] = predictions


def get_route_predictions_cache(venue_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves cached route blockage predictions for a venue.
    """
    return _route_predictions_cache.get(venue_id, [])


@router.get(
    "/api/zones",
    response_model=List[Dict[str, Any]],
    summary="Get venue zone configurations",
)
async def get_zones(
    venue_id: Optional[str] = Query(None, description="Optional venue ID filter")
) -> List[Dict[str, Any]]:
    """
    Fetches zone layout configurations for a venue.
    """
    logger.info(f"Fetching zone configurations for venue_id='{venue_id}'.")
    zones = supabase_client.get_zone_config(venue_id=venue_id)
    return zones


@router.post(
    "/api/zones",
    status_code=status.HTTP_200_OK,
    response_model=List[Dict[str, Any]],
    summary="Upsert venue zone configurations",
)
async def upsert_zones(zones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Upserts zone configurations for venue setup (supports `is_exit` boolean for exit zones).
    """
    logger.info(f"Upserting {len(zones)} zone configurations.")
    updated_zones = supabase_client.upsert_zone_config(zones)
    return updated_zones


@router.get(
    "/api/routes",
    response_model=Dict[str, Any],
    summary="Get live route blockage predictions",
)
async def get_route_predictions(
    venue_id: str = Query("cam_01", description="Venue or camera stream ID")
) -> Dict[str, Any]:
    """
    Returns the latest route blockage predictions for mobile safe-route navigation.
    Reads from an in-memory cache updated by the orchestrator on each frame.
    """
    logger.info(f"Fetching route blockage predictions for venue_id='{venue_id}'.")
    predictions = get_route_predictions_cache(venue_id)

    # Fallback to general cache if specific venue_id key is not matched yet
    if not predictions and _route_predictions_cache:
        predictions = next(iter(_route_predictions_cache.values()), [])

    return {
        "venue_id": venue_id,
        "route_blockage_predictions": predictions,
    }
