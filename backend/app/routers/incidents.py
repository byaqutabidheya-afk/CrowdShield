"""
Incident Reports Router for CrowdShield Backend.

Provides endpoints for creating and querying citizen and AI-generated incident reports.
"""

import logging
import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, status, Query
from pydantic import BaseModel

from app.models.schemas import IncidentReportCreate
from app.services import supabase_client

try:
    from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
except ImportError:
    from genai_pipeline.scripts.pipeline import GenAIPipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/incidents", tags=["Incident Reports"])
genai_pipeline = GenAIPipeline()


class IncidentSummaryPreviewRequest(BaseModel):
    zone_id: Optional[str] = None
    notes: str


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
            "client_device_id": report_dict.get("client_device_id"),
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
    client_device_id: Optional[str] = Query(None, description="Filter by client device ID"),
) -> List[Dict[str, Any]]:
    """
    Lists recent incident reports with optional filtering by zone_id, source, and/or client_device_id.
    Backs the IncidentReportsPanel source-filter toggle in the dashboard.
    """
    logger.info(f"Listing incident reports with zone_id='{zone_id}', source='{source}', client_device_id='{client_device_id}'.")
    reports = supabase_client.get_incident_reports(zone_id=zone_id, source=source, client_device_id=client_device_id)
    return reports


@router.post(
    "/summary",
    response_model=Dict[str, Any],
    summary="Generate a non-persistent AI summary preview",
)
async def generate_incident_summary_preview(payload: IncidentSummaryPreviewRequest) -> Dict[str, Any]:
    """Generate a summary for dashboard demo data that is not in the database."""
    zone_id = payload.zone_id or "unknown"
    summary = await asyncio.to_thread(
        genai_pipeline.summarize,
        zone_id,
        [{
            "risk_score": 0.7,
            "risk_level": "high",
            "contributing_factors": {"incident_report": 1.0},
            "notes": payload.notes,
        }],
    )
    return {"id": "mock-citizen-demo-report", "source": "citizen", "zone_id": payload.zone_id, "notes": payload.notes, "ai_summary": summary}


@router.post(
    "/{incident_id}/summary",
    response_model=Dict[str, Any],
    summary="Generate and persist an AI post-incident summary",
)
async def generate_incident_summary(incident_id: str) -> Dict[str, Any]:
    """Generate a summary from the incident's stored crowd-metric history."""
    report = await asyncio.to_thread(supabase_client.get_incident_report, incident_id)
    if not report:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Incident report not found")

    zone_id = str(report.get("zone_id") or "unknown")
    time_series = []
    if report.get("zone_id"):
        time_series = await asyncio.to_thread(supabase_client.get_trend_data, zone_id)

    # A report may arrive before historical metrics exist. Preserve the report
    # details so the generator can still produce a useful local/LLM summary.
    if not time_series:
        time_series = [{
            "timestamp": report.get("submitted_at"),
            "risk_score": 0.7,
            "risk_level": "high",
            "contributing_factors": {"incident_report": 1.0},
            "notes": report.get("notes", ""),
        }]

    summary = await asyncio.to_thread(genai_pipeline.summarize, zone_id, time_series)
    persisted = await asyncio.to_thread(
        supabase_client.update_incident_ai_summary, incident_id, summary
    )
    if persisted:
        return persisted
    return {**report, "ai_summary": summary}
