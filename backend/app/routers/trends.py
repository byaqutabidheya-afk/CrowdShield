"""
Trends & Historical Analytics Router for CrowdShield Backend.

Provides time-series metrics endpoints formatted for dashboard trend charts.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query

from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trends", tags=["Trends"])


@router.get(
    "/{zone_id}",
    response_model=List[Dict[str, Any]],
    summary="Get historical trend data for a zone",
)
async def get_zone_trends(
    zone_id: str,
    start_time: Optional[str] = Query(None, description="ISO timestamp start filter"),
    end_time: Optional[str] = Query(None, description="ISO timestamp end filter"),
) -> List[Dict[str, Any]]:
    """
    Queries historical metrics (density_score, risk_score, crowd_count, avg_flow_speed) for a zone.
    Returns a list of point dictionaries formatted for Recharts chart components.
    """
    logger.info(f"Fetching trend data for zone '{zone_id}' (start={start_time}, end={end_time}).")
    raw_data = supabase_client.get_trend_data(
        zone_id=zone_id, start_time=start_time, end_time=end_time
    )

    formatted_points = []
    for row in raw_data:
        formatted_points.append(
            {
                "timestamp": row.get("timestamp"),
                "density_score": float(row.get("density_score", 0.0)),
                "risk_score": float(row.get("risk_score", 0.0)),
                "crowd_count": int(row.get("crowd_count", 0)),
                "avg_flow_speed": float(row.get("avg_flow_speed", 0.0)),
                "risk_level": row.get("risk_level", "low"),
            }
        )

    return formatted_points
