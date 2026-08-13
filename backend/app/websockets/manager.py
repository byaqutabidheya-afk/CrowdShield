"""
WebSocket Connection Manager for CrowdShield Backend.

Tracks active WebSocket connections and handles json broadcasting to all connected clients.
"""

import json
import logging
from typing import Any, Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class _SafeJSONEncoder(json.JSONEncoder):
    """
    JSON encoder that handles numpy scalar types and other non-standard Python
    objects that the default encoder rejects.  Falls back to str() for anything
    else so the broadcast never raises and never silently drops the connection.
    """

    def default(self, obj: Any) -> Any:
        # Handle numpy scalars without importing numpy at module level (optional dep)
        type_name = type(obj).__name__
        module = getattr(type(obj), "__module__", "")
        if module.startswith("numpy"):
            if hasattr(obj, "item"):
                return obj.item()  # converts np.int64, np.float64, np.bool_, etc. to Python native
        return str(obj)


def _safe_dumps(message: Dict[str, Any]) -> str:
    return json.dumps(message, cls=_SafeJSONEncoder)


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
        Uses a numpy-safe encoder so unserializable types never silently drop connections.
        """
        if not self.active_connections:
            return

        try:
            text = _safe_dumps(message)
        except Exception as e:
            logger.error(f"Failed to serialize broadcast message to JSON: {e}")
            return

        disconnected_sockets: List[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}. Dropping connection.")
                disconnected_sockets.append(connection)

        for conn in disconnected_sockets:
            await self.disconnect(conn)


# Global singleton ConnectionManager instance
manager = ConnectionManager()
