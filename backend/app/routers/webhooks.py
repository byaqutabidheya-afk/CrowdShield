"""
Webhooks & Digital Signage Integration Router for CrowdShield Backend.

Provides webhook receivers for external hardware integrations (e.g. digital signage boards).
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


class SignageWebhookRequest(BaseModel):
    zone_id: str = Field(..., description="Target zone ID for digital signage update")
    message: str = Field(..., description="Directional or emergency message to display")
    direction_arrows: Optional[List[str]] = Field(
        None, description="Compass directions (e.g. ['N', 'NE'])"
    )


@router.post(
    "/signage",
    status_code=status.HTTP_200_OK,
    response_model=Dict[str, Any],
    summary="Trigger digital signage hardware message update",
)
async def update_digital_signage(payload: SignageWebhookRequest) -> Dict[str, Any]:
    """
    SIMULATED HARDWARE INTEGRATION POINT:
    In a production deployment, this endpoint forwards emergency directional messages
    to physical LED signage vendors via MQTT/HTTP REST webhooks.
    For this hackathon prototype, it logs an intervention record to Supabase and returns a mock success.
    """
    logger.info(
        f"[SIMULATED SIGNAGE WEBHOOK] Updating signage for zone '{payload.zone_id}': '{payload.message}'"
    )

    # Log visual signage intervention into DB audit trail
    intervention_record = {
        "zone_id": payload.zone_id,
        "action_taken": f"Digital Signage: {payload.message}",
        "category": "visual_signage",
        "triggered_by": "operator",
    }
    supabase_client.insert_intervention(intervention_record)

    return {
        "status": "simulated_dispatch",
        "target_signage_ids": [
            f"sign_board_{payload.zone_id}_01",
            f"sign_board_{payload.zone_id}_02",
        ],
        "zone_id": payload.zone_id,
        "message": payload.message,
        "direction_arrows": payload.direction_arrows or [],
    }
