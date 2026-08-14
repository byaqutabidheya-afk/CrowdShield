"""
EventOrchestrator Service for CrowdShield Backend.

Central processing engine that wires together:
- Phase 1: Computer Vision Analytics (CVPipeline)
- Phase 2: Risk Prediction & Panic Diffusion (RiskEngine)
- Phase 3: Generative AI & Recommendations (GenAIPipeline)
- Weather Service Risk Multiplier
- Supabase Persistence Layer
- WebSocket Realtime Broadcaster
"""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import AI Core modules with fallbacks
try:
    from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
    from ai_core.shared.zone_config import Zone
except ImportError:
    from genai_pipeline.scripts.pipeline import GenAIPipeline
    from shared.zone_config import Zone

from app.services import supabase_client, weather_service

logger = logging.getLogger(__name__)


def _normalize_zones(zones: List[Any]) -> List[Zone]:
    """
    Ensures all items in the zones list are converted to Zone dataclass objects.
    """
    normalized = []
    for z in zones:
        if isinstance(z, Zone):
            normalized.append(z)
        elif isinstance(z, dict):
            normalized.append(Zone.from_dict(z))
        else:
            logger.warning(f"Unexpected zone object format: {type(z)}")
    return normalized


class EventOrchestrator:
    """
    Central loop orchestrator managing live video feed analysis, risk prediction,
    alert lifecycle management, and WebSocket streaming broadcasts.
    """

    def __init__(self) -> None:
        self._risk_engine = None
        self.genai = GenAIPipeline()

        # In-memory tracking of zone alert states
        self.active_alerts: Dict[str, str] = {}  # zone_id -> alert_id
        self.previous_zone_risk_levels: Dict[str, str] = {}  # zone_id -> risk_level

        # Live processing status & stats for demo runner & video_control router
        self.is_processing: bool = False
        self.frames_processed: int = 0
        self.start_time: Optional[datetime] = None
        self.max_risk_score_seen: float = 0.0

    @property
    def risk_engine(self):
        if self._risk_engine is None:
            try:
                from ai_core.risk_engine.scripts.pipeline import RiskEngine
            except ImportError:
                from risk_engine.scripts.pipeline import RiskEngine
            self._risk_engine = RiskEngine()
        return self._risk_engine

    async def _trigger_push_notification_hook(self, alert_data: Dict[str, Any]) -> None:
        """
        Triggers FCM push notifications to registered mobile devices when a new high/critical
        risk alert is created.
        """
        zone_id = alert_data.get("zone_id", "Unknown")
        risk_level = str(alert_data.get("risk_level", "HIGH")).upper()
        recs = alert_data.get("recommendations", [])
        top_action = recs[0].get("action") if recs and isinstance(recs[0], dict) else None

        title = f"🚨 CROWD SAFETY ALERT: Zone {zone_id} ({risk_level})"
        body = top_action if top_action else f"High risk detected in Zone {zone_id}. Please follow safety directions."
        data_payload = {
            "zone_id": str(zone_id),
            "risk_level": str(risk_level),
            "alert_id": str(alert_data.get("id", "")),
        }

        logger.info(f"Firing FCM push notification for alert in zone '{zone_id}'...")
        try:
            from app.services import fcm_service
            await fcm_service.send_push_to_all_devices(title, body, data_payload)
        except Exception as e:
            logger.error(f"Error dispatching FCM push notification: {e}")

    async def run_live_processing(
        self,
        video_source: str | Path,
        zones: List[Any],
        venue_id: str,
        websocket_manager: Any,
        sample_every_n_frames: int = 3,
        target_fps: float = 10.0,
    ) -> None:
        """
        Main processing loop iterating over CVPipeline stream, scoring with RiskEngine,
        applying weather multiplier, writing metrics to Supabase, handling GenAI recommendations,
        and broadcasting combined frame packets over WebSockets.
        """
        logger.info(f"Starting live orchestrator loop for venue '{venue_id}' with video '{video_source}'.")

        self.is_processing = True
        self.start_time = datetime.now(timezone.utc)
        self.frames_processed = 0
        self.max_risk_score_seen = 0.0

        # a) Normalize zones and instantiate CVPipeline
        normalized_zones = _normalize_zones(zones)
        zone_config_map = {z.zone_id: z.to_dict() for z in normalized_zones}

        try:
            from ai_core.cv_pipeline.scripts.pipeline import CVPipeline
        except ImportError:
            from cv_pipeline.scripts.pipeline import CVPipeline

        cv_pipeline = CVPipeline(
            video_path=video_source,
            zones=normalized_zones,
            source_id=f"cam_{venue_id}",
        )

        # c) Fetch venue-wide panic-diffusion parameters once before processing loop starts
        venue_config = supabase_client.get_venue_config(venue_id)
        venue_diffusion_rate = venue_config.get("diffusion_rate", 0.15)
        venue_decay_rate = venue_config.get("decay_rate", 0.05)

        logger.info(
            f"Venue '{venue_id}' diffusion_rate={venue_diffusion_rate}, decay_rate={venue_decay_rate}."
        )

        # b) Obtain Phase 1 streaming generator
        frame_generator = cv_pipeline.process_video(
            video_path=video_source,
            sample_every_n_frames=sample_every_n_frames,
            mode="stream",
        )

        sleep_interval = 1.0 / max(1.0, target_fps)

        try:
            for cv_frame in frame_generator:
                if not isinstance(cv_frame, dict):
                    continue

                self.frames_processed += 1

                # c) Process frame via RiskEngine using venue-specific tuning parameters
                risk_output = self.risk_engine.process_frame(
                    cv_frame,
                    diffusion_rate=venue_diffusion_rate,
                    decay_rate=venue_decay_rate,
                )

                # d) Assemble combined frame payload
                risk_data = {
                    "zones": risk_output.get("zones", []),
                    "panic_propagation": risk_output.get("panic_propagation", {}),
                    "predicted_crush_timeline": risk_output.get("predicted_crush_timeline", []),
                    "resource_allocation_suggestions": risk_output.get("resource_allocation_suggestions", []),
                }

                # Update in-memory route predictions cache for GET /api/routes
                try:
                    from app.routers.zones import update_route_predictions_cache
                    update_route_predictions_cache(venue_id, risk_output.get("route_blockage_predictions", []))
                except Exception as e:
                    logger.debug(f"Could not update route predictions cache: {e}")

                frame_timestamp = cv_frame.get("timestamp") or datetime.now(timezone.utc).isoformat()
                combined_payload: Dict[str, Any] = {
                    "timestamp": frame_timestamp,
                    "cv_data": cv_frame,
                    "risk_data": risk_data,
                    "frames_processed": self.frames_processed,
                }

                # e) Apply weather risk multiplier to outdoor zones
                weather_multiplier = weather_service.get_weather_risk_multiplier()
                if weather_multiplier > 1.0:
                    for risk_zone in risk_data.get("zones", []):
                        z_id = str(risk_zone.get("zone_id") or risk_zone.get("id") or "")
                        zone_cfg = zone_config_map.get(z_id, {})

                        is_outdoor = (
                            zone_cfg.get("is_outdoor")
                            or zone_cfg.get("outdoor")
                            or zone_cfg.get("type") == "outdoor"
                            or "outdoor" in zone_cfg.get("tags", [])
                            or not zone_cfg.get("is_indoor", False)
                        )

                        if is_outdoor:
                            raw_score = float(risk_zone.get("risk_score", 0.0))
                            adjusted_score = min(1.0, round(raw_score * weather_multiplier, 3))
                            risk_zone["risk_score"] = adjusted_score

                            # Recalculate risk level string if elevated
                            if adjusted_score >= 0.8:
                                risk_zone["risk_level"] = "critical"
                            elif adjusted_score >= 0.6:
                                risk_zone["risk_level"] = "high"
                            elif adjusted_score >= 0.3:
                                risk_zone["risk_level"] = "moderate"

                # Track max risk score seen
                for rz in risk_data.get("zones", []):
                    score = float(rz.get("risk_score", 0.0))
                    if score > self.max_risk_score_seen:
                        self.max_risk_score_seen = score

                # f) Asynchronously insert crowd metrics records into Supabase
                cv_zones_map = {
                    str(z.get("zone_id")): z for z in cv_frame.get("zones", []) if isinstance(z, dict)
                }

                for risk_zone in risk_data.get("zones", []):
                    z_id = str(risk_zone.get("zone_id") or risk_zone.get("id") or "")
                    cv_z = cv_zones_map.get(z_id, {})

                    metrics_record = {
                        "zone_id": z_id,
                        "timestamp": frame_timestamp,
                        "crowd_count": int(cv_z.get("crowd_count", 0)),
                        "density_score": float(risk_zone.get("contributing_factors", {}).get("density_score", cv_z.get("density_score", 0.0))),
                        "avg_flow_speed": float(cv_z.get("avg_flow_speed", 0.0)),
                        "avg_flow_direction_deg": float(cv_z.get("avg_flow_direction_deg", 0.0)),
                        "risk_score": float(risk_zone.get("risk_score", 0.0)),
                        "risk_level": str(risk_zone.get("risk_level", "low")),
                        "anomaly_flags": cv_z.get("anomaly_flags", []),
                        "contributing_factors": risk_zone.get("contributing_factors", {}),
                    }

                    # Prevent thread pool exhaustion by skipping heavy synchronous DB inserts
                    # asyncio.create_task(
                    #     asyncio.to_thread(supabase_client.insert_crowd_metrics, metrics_record)
                    # )

                # g) Alert Lifecycle Management & Recommendations
                new_alerts_this_frame = []
                for risk_zone in risk_data.get("zones", []):
                    z_id = str(risk_zone.get("zone_id") or risk_zone.get("id") or "")
                    curr_level = str(risk_zone.get("risk_level", "low"))
                    prev_level = self.previous_zone_risk_levels.get(z_id, "low")

                    # Clear active alert tracking if zone returns to safe levels
                    if curr_level in ("low", "moderate") and z_id in self.active_alerts:
                        del self.active_alerts[z_id]

                    # Check escalation into high or critical state
                    escalated = (
                        (curr_level == "high" and prev_level in ("low", "moderate")) or
                        (curr_level == "critical" and prev_level in ("low", "moderate", "high"))
                    )

                    if escalated:
                        logger.warning(
                            f"Zone '{z_id}' escalated from '{prev_level}' to '{curr_level}'. "
                            f"Generating GenAI recommendations."
                        )

                        neighbor_zones = [
                            rz for rz in risk_data.get("zones", []) if rz.get("zone_id") != z_id
                        ]
                        rec_output = await asyncio.to_thread(
                            self.genai.recommendation_engine.generate_recommendations,
                            risk_zone,
                            neighbor_zones,
                        )

                        recommendations = rec_output.get("recommendations", [])
                        alert_record = {
                            "zone_id": z_id,
                            "triggered_at": frame_timestamp,
                            "risk_level": curr_level,
                            "peak_risk_score": float(risk_zone.get("risk_score", 0.0)),
                            "recommendations": recommendations,
                        }

                        # Insert alert record into Supabase
                        alert_id = await asyncio.to_thread(
                            supabase_client.insert_risk_alert, alert_record
                        )
                        if alert_id:
                            alert_record["id"] = alert_id
                            self.active_alerts[z_id] = alert_id

                        new_alerts_this_frame.append(alert_record)

                        # Trigger FCM push notification hook for mobile devices
                        await self._trigger_push_notification_hook(alert_record)

                    # Update tracked risk level for transition detection
                    self.previous_zone_risk_levels[z_id] = curr_level

                if new_alerts_this_frame:
                    combined_payload["type"] = "alert"
                    combined_payload["alert"] = new_alerts_this_frame[0]
                    combined_payload["new_alerts"] = new_alerts_this_frame
                else:
                    combined_payload["type"] = "frame_update"

                # Broadcast combined frame over WebSocket
                await websocket_manager.broadcast(combined_payload)

                # Maintain target streaming frame rate
                await asyncio.sleep(sleep_interval)

        except asyncio.CancelledError:
            logger.info("Processing loop task was cancelled.")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in live orchestrator loop: {e}", exc_info=True)
        finally:
            self.is_processing = False
            logger.info("Live orchestrator processing loop stopped.")
