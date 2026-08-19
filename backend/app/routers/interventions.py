"""
Interventions Router for CrowdShield Backend.

Provides endpoints for manually logging and viewing crowd management interventions.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interventions", tags=["Interventions"])

# In-memory storage for local demo / offline mode resilience
_in_memory_interventions: List[Dict[str, Any]] = [
    {
        "id": "intv_init_01",
        "zone_id": "zone_A1",
        "action_taken": "Dispatched 4 security marshals to regulate entrance queue.",
        "category": "crowd_control",
        "triggered_by": "operator",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "intv_init_02",
        "zone_id": "zone_A2",
        "action_taken": "Adjusted barrier flow direction to relieve corridor bottleneck.",
        "category": "manual",
        "triggered_by": "operator",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
]


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
        logger.warning("Database insert returned None, generating structured fallback record.")
        created_record = {
            "id": f"intv_{uuid.uuid4().hex[:8]}",
            "zone_id": payload.zone_id,
            "action_taken": payload.action_taken,
            "category": payload.category,
            "triggered_by": payload.triggered_by,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # Ensure record has a timestamp
    if "timestamp" not in created_record or not created_record["timestamp"]:
        created_record["timestamp"] = datetime.now(timezone.utc).isoformat()

    # Store in memory for instant local retrieval
    _in_memory_interventions.insert(0, created_record)

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
    if client:
        try:
            query = client.table("interventions").select("*")
            if zone_id:
                query = query.eq("zone_id", zone_id)
            response = query.order("timestamp", desc=True).execute()
            if response.data:
                return response.data
        except Exception as e:
            logger.error(f"Error fetching interventions from DB: {e}")

    # Return in-memory fallback list
    if zone_id:
        return [i for i in _in_memory_interventions if i.get("zone_id") == zone_id]
    return _in_memory_interventions
