"""
Supabase client service module for CrowdShield.

Provides a singleton Supabase client and helper methods for CRUD operations on:
- zones
- venue_configs
- crowd_metrics
- risk_alerts
- incident_reports
- interventions
- devices
"""

import os
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Global singleton client instance
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    """
    Returns the singleton Supabase client instance.
    Initializes the client if it hasn't been initialized yet.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.warning(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables missing. "
            "Supabase client operations will run in degraded/mock mode."
        )
        return None

    try:
        _supabase_client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client successfully initialized.")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return None


def insert_crowd_metrics(zone_frame_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Insert a crowd metrics snapshot record into the `crowd_metrics` table.
    Auto-seeds missing zone in `zones` table if foreign key constraint is triggered.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping insert_crowd_metrics.")
        return None

    try:
        response = client.table("crowd_metrics").insert(zone_frame_data).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        err_str = str(e)
        if "23503" in err_str or "violates foreign key constraint" in err_str or "crowd_metrics_zone_id_fkey" in err_str:
            z_id = str(zone_frame_data.get("zone_id", "zone_A1"))
            logger.info(f"Auto-seeding missing zone '{z_id}' into zones table to satisfy foreign key...")
            upsert_zone_config([
                {
                    "zone_id": z_id,
                    "venue_id": "test_venue",
                    "bounds_normalized": {"x_min": 0, "y_min": 0, "x_max": 0.33, "y_max": 0.33},
                    "max_expected_count": 50,
                    "adjacency": [],
                }
            ])
            try:
                response = client.table("crowd_metrics").insert(zone_frame_data).execute()
                return response.data[0] if response.data else None
            except Exception as retry_err:
                logger.error(f"Retry inserting crowd metrics failed for zone {z_id}: {retry_err}")
                return None
        logger.error(f"Error inserting crowd metrics: {e}")
        return None


def insert_risk_alert(alert: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Insert a new risk alert into the `risk_alerts` table.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping insert_risk_alert.")
        return None

    try:
        response = client.table("risk_alerts").insert(alert).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error inserting risk alert: {e}")
        return None


def resolve_risk_alert(alert_id: str) -> Optional[Dict[str, Any]]:
    """
    Mark a risk alert as resolved in the `risk_alerts` table.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping resolve_risk_alert.")
        return None

    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        response = (
            client.table("risk_alerts")
            .update({"status": "resolved", "resolved_at": now_iso})
            .eq("id", alert_id)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error resolving risk alert {alert_id}: {e}")
        return None


def insert_incident_report(report: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Insert an incident report into the `incident_reports` table.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping insert_incident_report.")
        return None

    try:
        response = client.table("incident_reports").insert(report).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error inserting incident report: {e}")
        return None


def get_incident_reports(
    zone_id: Optional[str] = None, source: Optional[str] = None, client_device_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Query incident reports, optionally filtered by zone_id, source, and/or client_device_id.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Returning empty incident reports list.")
        return []

    try:
        query = client.table("incident_reports").select("*")
        if zone_id:
            query = query.eq("zone_id", zone_id)
        if source:
            query = query.eq("source", source)
        if client_device_id:
            query = query.eq("client_device_id", client_device_id)
        response = query.order("submitted_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching incident reports: {e}")
        return []


def get_incident_report(report_id: str) -> Optional[Dict[str, Any]]:
    """Fetch one incident report by its database ID."""
    client = get_supabase_client()
    if not client:
        return None
    try:
        response = client.table("incident_reports").select("*").eq("id", report_id).limit(1).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error fetching incident report {report_id}: {e}")
        return None


def update_incident_ai_summary(report_id: str, ai_summary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Persist an AI-generated summary on an incident report."""
    client = get_supabase_client()
    if not client:
        return None
    try:
        response = (
            client.table("incident_reports")
            .update({"ai_summary": ai_summary})
            .eq("id", report_id)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error updating AI summary for incident {report_id}: {e}")
        return None


def insert_intervention(intervention: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Insert a recorded intervention into the `interventions` table.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping insert_intervention.")
        return None

    try:
        response = client.table("interventions").insert(intervention).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error inserting intervention: {e}")
        return None


def get_zone_config(venue_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetch zone configurations from the `zones` table, optionally filtered by venue_id.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Returning empty zone configs.")
        return []

    try:
        query = client.table("zones").select("*")
        if venue_id:
            query = query.eq("venue_id", venue_id)
        response = query.execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching zone configs: {e}")
        return []


def upsert_zone_config(zones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Upsert a list of zone records into the `zones` table.
    Sanitizes keys to match Postgres `zones` table schema.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping upsert_zone_config.")
        return []

    sanitized_records = []
    for z in zones:
        z_id = str(z.get("zone_id") or z.get("id") or "")
        venue_id = str(z.get("venue_id") or "test_venue")
        bounds = z.get("bounds_normalized", {})
        max_count = int(z.get("max_expected_count", 50))
        adjacency = z.get("adjacency") or z.get("adjacent_zone_ids") or []

        record = {
            "zone_id": z_id,
            "venue_id": venue_id,
            "bounds_normalized": bounds,
            "max_expected_count": max_count,
            "adjacency": adjacency,
        }
        sanitized_records.append(record)

    try:
        response = client.table("zones").upsert(sanitized_records).execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error upserting zone configs: {e}")
        return []


def get_venue_config(venue_id: str) -> Dict[str, Any]:
    """
    Get venue panic-diffusion tuning config from `venue_configs`.
    Returns dict with {venue_id, diffusion_rate, decay_rate}.
    Defaults to diffusion_rate=0.15, decay_rate=0.05 if row missing.
    """
    default_config = {
        "venue_id": venue_id,
        "diffusion_rate": 0.15,
        "decay_rate": 0.05,
    }

    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Returning default venue config.")
        return default_config

    try:
        response = (
            client.table("venue_configs").select("*").eq("venue_id", venue_id).execute()
        )
        if response.data and len(response.data) > 0:
            row = response.data[0]
            return {
                "venue_id": row.get("venue_id", venue_id),
                "diffusion_rate": float(row.get("diffusion_rate", 0.15)),
                "decay_rate": float(row.get("decay_rate", 0.05)),
                "updated_at": row.get("updated_at"),
            }
        return default_config
    except Exception as e:
        logger.error(f"Error fetching venue config for {venue_id}: {e}")
        return default_config


def upsert_venue_config(
    venue_id: str, diffusion_rate: float, decay_rate: float
) -> Dict[str, Any]:
    """
    Upsert venue panic-diffusion tuning config into `venue_configs`.
    """
    payload = {
        "venue_id": venue_id,
        "diffusion_rate": diffusion_rate,
        "decay_rate": decay_rate,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Skipping upsert_venue_config.")
        return payload

    try:
        response = client.table("venue_configs").upsert(payload).execute()
        return response.data[0] if response.data else payload
    except Exception as e:
        logger.error(f"Error upserting venue config for {venue_id}: {e}")
        return payload


def get_trend_data(
    zone_id: str, start_time: Optional[Any] = None, end_time: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Fetch historical crowd metrics for a zone within a timestamp range.
    """
    client = get_supabase_client()
    if not client:
        logger.warning("Supabase client uninitialized. Returning empty trend data.")
        return []

    try:
        query = client.table("crowd_metrics").select("*").eq("zone_id", zone_id)
        if start_time:
            start_str = (
                start_time.isoformat()
                if hasattr(start_time, "isoformat")
                else str(start_time)
            )
            query = query.gte("timestamp", start_str)
        if end_time:
            end_str = (
                end_time.isoformat()
                if hasattr(end_time, "isoformat")
                else str(end_time)
            )
            query = query.lte("timestamp", end_str)

        response = query.order("timestamp", desc=False).execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching trend data for zone {zone_id}: {e}")
        return []
