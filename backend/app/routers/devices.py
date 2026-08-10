"""
Devices & FCM Push Notification Token Router for CrowdShield Backend.

Provides registration endpoints for mobile companion app device push tokens.
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Response, status

from app.models.schemas import DeviceRegister
from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices", tags=["Devices"])


@router.post(
    "/register",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Register or update mobile push notification token",
)
async def register_device(payload: DeviceRegister) -> Response:
    """
    Registers a mobile device FCM push token and optional last known GPS location into Supabase `devices`.
    Returns HTTP 204 No Content on success.
    """
    logger.info(f"Registering device push token '{payload.push_token[:10]}...'.")

    now_iso = datetime.now(timezone.utc).isoformat()
    device_data = {
        "push_token": payload.push_token,
        "last_known_location": payload.last_known_location,
        "updated_at": now_iso,
    }

    client = supabase_client.get_supabase_client()
    if client:
        try:
            client.table("devices").upsert(device_data).execute()
        except Exception as e:
            logger.error(f"Error registering device token: {e}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)
