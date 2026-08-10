"""
WebSocket Routes for CrowdShield Backend.

Provides the `/ws/live` endpoint for streaming real-time crowd metrics and risk alerts.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websockets.manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket) -> None:
    """
    WebSocket route `/ws/live`. Registers connected clients with ConnectionManager
    and keeps the connection open listening for disconnect events.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Maintain active connection listening for incoming messages or disconnects
            message = await websocket.receive_text()
            logger.debug(f"Received message on /ws/live: {message}")
    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/live.")
        await manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"Unexpected error on /ws/live connection: {e}")
        await manager.disconnect(websocket)
