"""
Interventions Router for CrowdShield Backend.

Provides endpoints for manually logging and viewing crowd management interventions.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interventions", tags=["Interventions"])


class InterventionCreate(BaseModel):
    zone_id: str = Field(..., description="Target zone ID")
    action_taken: str = Field(..., description="Description of the action taken")
    category: str = Field("manual", description="Intervention category (e.g. 'manual', 'crowd_control')")
    triggered_by: str = Field("operator", description="Trigger source ('operator' or 'ai_suggested')")


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Dict[str, Any],
    summary="Log a manual intervention",
)
async def create_intervention(payload: InterventionCreate) -> Dict[str, Any]:
    """
    Logs an intervention (e.g. barricade repositioning, medical team dispatch).
    Completes the dashboard's AI Intervention Panel 'Log Intervention' quick action.
    """
    logger.info(f"Logging intervention for zone '{payload.zone_id}': '{payload.action_taken}'.")

    data = payload.model_dump()
    created_record = supabase_client.insert_intervention(data)

    if not created_record:
        logger.warning("Database insert returned None, returning fallback response.")
        return {
            "id": "temp_intervention_id",
            "zone_id": payload.zone_id,
            "action_taken": payload.action_taken,
            "category": payload.category,
            "triggered_by": payload.triggered_by,
        }

    return created_record


@router.get(
    "",
    response_model=List[Dict[str, Any]],
    summary="List recorded interventions",
)
async def list_interventions(
    zone_id: Optional[str] = Query(None, description="Optional zone ID filter")
) -> List[Dict[str, Any]]:
    """
    Lists recent intervention records for audit-trail visibility.
    """
    logger.info(f"Listing interventions for zone_id='{zone_id}'.")
    client = supabase_client.get_supabase_client()
    if not client:
        return []

    try:
        query = client.table("interventions").select("*")
        if zone_id:
            query = query.eq("zone_id", zone_id)
        response = query.order("timestamp", desc=True).execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching interventions: {e}")
        return []
