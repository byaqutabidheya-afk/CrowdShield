"""
WebSocket Connection Manager for CrowdShield Backend.

Tracks active WebSocket connections and handles json broadcasting to all connected clients.
"""

import logging
from typing import Any, Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket client connections and handles broadcasting messages.
    """

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """
        Accepts incoming WebSocket connection and adds it to the active list.
        """
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            f"WebSocket client connected. Total active connections: {len(self.active_connections)}"
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Removes WebSocket connection from the active list.
        """
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(
                f"WebSocket client disconnected. Remaining connections: {len(self.active_connections)}"
            )

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        JSON-serializes and broadcasts a message to all active WebSocket connections.
        Silently drops any connections that error during delivery.
        """
        if not self.active_connections:
            return

        disconnected_sockets: List[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}. Dropping connection.")
                disconnected_sockets.append(connection)

        for conn in disconnected_sockets:
            await self.disconnect(conn)


# Global singleton ConnectionManager instance
manager = ConnectionManager()
