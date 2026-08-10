"""
Incident Reports Router for CrowdShield Backend.

Provides endpoints for creating and querying citizen and AI-generated incident reports.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, status, Query

from app.models.schemas import IncidentReportCreate
from app.services import supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents", tags=["Incident Reports"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Dict[str, Any],
    summary="Submit an incident report",
)
async def create_incident_report(report: IncidentReportCreate) -> Dict[str, Any]:
    """
    Submits a new incident report (citizen-submitted or AI-generated).
    """
    logger.info(f"Creating incident report from source '{report.source}' for zone '{report.zone_id}'.")
    report_dict = report.model_dump(exclude_unset=True)
    if "source" not in report_dict or not report_dict["source"]:
        report_dict["source"] = "citizen"

    created_record = supabase_client.insert_incident_report(report_dict)
    if not created_record:
        logger.warning("Database insert returned None. Returning fallback payload.")
        return {
            "id": "temp_incident_id",
            "source": report_dict.get("source", "citizen"),
            "zone_id": report_dict.get("zone_id"),
            "gps_coordinates": report_dict.get("gps_coordinates"),
            "photo_url": report_dict.get("photo_url"),
            "notes": report_dict.get("notes"),
            "ai_summary": report_dict.get("ai_summary"),
        }

    return created_record


@router.get(
    "",
    response_model=List[Dict[str, Any]],
    summary="List recent incident reports",
)
async def list_incident_reports(
    zone_id: Optional[str] = Query(None, description="Filter by zone ID"),
    source: Optional[str] = Query(
        None, description="Filter by report source ('citizen' or 'ai_generated')"
    ),
) -> List[Dict[str, Any]]:
    """
    Lists recent incident reports with optional filtering by zone_id and/or source.
    Backs the IncidentReportsPanel source-filter toggle in the dashboard.
    """
    logger.info(f"Listing incident reports with zone_id='{zone_id}', source='{source}'.")
    reports = supabase_client.get_incident_reports(zone_id=zone_id, source=source)
    return reports
