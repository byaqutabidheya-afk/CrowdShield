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

    async def run_pre_event_simulation(
        self,
        zones: List[Any],
        entry_zone_ids: List[str],
        expected_attendance: int,
        arrival_duration_minutes: int = 30,
        num_steps: int = 20,
    ) -> Dict[str, Any]:
        """Run the offline arrival-buildup simulation for the dashboard.

        The simulator is CPU-only and synchronous, so run it in a worker thread
        to avoid blocking FastAPI's event loop while a larger venue is tested.
        """
        normalized_zones = _normalize_zones(zones)
        if not normalized_zones:
            raise ValueError("At least one valid zone is required.")

        normalized_entry_zone_ids = [str(zone_id) for zone_id in entry_zone_ids if zone_id]
        if not normalized_entry_zone_ids:
            raise ValueError("At least one entry zone is required.")

        # Import through RiskEngine so the API and CLI use the same adjacency and
        # pre-event simulation implementations.
        risk_engine = self.risk_engine
        try:
            from ai_core.risk_engine.scripts.zone_adjacency import compute_zone_adjacency_map
        except ImportError:
            from risk_engine.scripts.zone_adjacency import compute_zone_adjacency_map

        adjacency_map = compute_zone_adjacency_map(normalized_zones)
        steps = await asyncio.to_thread(
            risk_engine.pre_event_simulator.simulate_arrival_buildup,
            normalized_zones,
            normalized_entry_zone_ids,
            expected_attendance,
            adjacency_map,
            arrival_duration_minutes,
            num_steps,
        )
        bottlenecks = risk_engine.pre_event_simulator.flag_bottleneck_risks(steps)

        peak_density_zones: Dict[str, float] = {}
        for step in steps:
            for zone_id, score in step.get("zone_risk_scores", {}).items():
                peak_density_zones[zone_id] = max(
                    peak_density_zones.get(zone_id, 0.0), float(score)
                )

        return {
            "total_attendance": expected_attendance,
            "arrival_duration_minutes": arrival_duration_minutes,
            "num_steps": num_steps,
            "simulated_steps": steps,
            # `steps` is kept as a frontend-friendly alias for this API result.
            "steps": steps,
            "peak_density_zones": peak_density_zones,
            "bottlenecks_detected": bottlenecks,
            "recommendations": [
                f"Monitor {item['zone_id']} from simulation step {item['step']}"
                for item in bottlenecks
            ],
        }

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
        video_source: str,
        zones: List[Dict[str, Any]],
        venue_id: str = "test_venue",
        websocket_manager: Any = None,
        sample_every_n_frames: int = 3,
        target_fps: float = 10.0,
        session_id: Optional[str] = None,
    ) -> None:
        """
        Main processing loop iterating over CVPipeline stream, scoring with RiskEngine,
        applying weather multiplier, writing metrics to Supabase, handling GenAI recommendations,
        and broadcasting combined frame packets over WebSockets.
        """
        active_session = session_id or uuid.uuid4().hex
        self.current_session_id = active_session
        self.is_processing = True
        self.start_time = datetime.now(timezone.utc)
        self.frames_processed = 0
        self.max_risk_score_seen = 0.0
        self.active_alerts.clear()
        self.previous_zone_risk_levels.clear()

        logger.info(
            f"Starting live orchestrator session '{active_session}' for venue '{venue_id}' with video '{video_source}'."
        )

        try:
            from ai_core.risk_engine.scripts.pipeline import RiskEngine
            self.risk_engine = RiskEngine()
        except Exception:
            pass

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

        # b) Obtain Phase 1 streaming generator with seamless continuous looping
        def _create_generator():
            return cv_pipeline.process_video(
                video_path=video_source,
                sample_every_n_frames=sample_every_n_frames,
                mode="stream",
            )

        frame_generator = _create_generator()

        try:
            while self.is_processing and self.current_session_id == active_session:
                cv_frame = await asyncio.to_thread(lambda: next(frame_generator, None))
                if self.current_session_id != active_session:
                    logger.info(f"Session '{active_session}' superseded by '{self.current_session_id}'. Exiting old loop.")
                    break

                if cv_frame is None:
                    # Seamlessly loop back to start of video for continuous live CCTV surveillance
                    logger.info(f"Session '{active_session}' reached end of file. Seamlessly looping video.")
                    frame_generator = _create_generator()
                    cv_frame = await asyncio.to_thread(lambda: next(frame_generator, None))
                    if cv_frame is None or self.current_session_id != active_session:
                        break

                if not isinstance(cv_frame, dict):
                    continue

                self.frames_processed += 1

                # c) Process frame via RiskEngine using venue-specific tuning parameters
                risk_output = await asyncio.to_thread(
                    self.risk_engine.process_frame,
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
                            f"Triggering active alert."
                        )

                        neighbor_zones = [
                            rz for rz in risk_data.get("zones", []) if rz.get("zone_id") != z_id
                        ]

                        try:
                            from ai_core.genai_pipeline.scripts.recommendation_engine import _generate_contextual_fallback
                            initial_recs = _generate_contextual_fallback(risk_zone)
                        except Exception:
                            initial_recs = [
                                {
                                    "action": f"Deploy crowd stewards to monitor {z_id} immediately.",
                                    "category": "crowd_control",
                                    "urgency": "immediate" if curr_level == "critical" else "soon",
                                    "reasoning": f"Elevated crowd risk level ({curr_level}) observed.",
                                }
                            ]

                        alert_record = {
                            "zone_id": z_id,
                            "triggered_at": frame_timestamp,
                            "risk_level_at_trigger": curr_level,
                            "peak_risk_score": float(risk_zone.get("risk_score", 0.0)),
                            "recommendations": initial_recs,
                        }

                        new_alerts_this_frame.append(alert_record)

                        # Offload Supabase insertion, FCM push notification, and LLM enhancement to background task
                        async def _handle_alert_background(
                            rec_alert: Dict[str, Any],
                            target_zone_id: str,
                            r_zone: Dict[str, Any],
                            n_zones: List[Dict[str, Any]],
                        ):
                            try:
                                try:
                                    llm_out = await asyncio.to_thread(
                                        self.genai.recommendation_engine.generate_recommendations,
                                        r_zone,
                                        n_zones,
                                    )
                                    if llm_out and llm_out.get("recommendations"):
                                        rec_alert["recommendations"] = llm_out["recommendations"]
                                except Exception:
                                    pass

                                alert_id = await asyncio.to_thread(
                                    supabase_client.insert_risk_alert, rec_alert
                                )
                                if alert_id:
                                    rec_alert["id"] = alert_id
                                    self.active_alerts[target_zone_id] = alert_id

                                await self._trigger_push_notification_hook(rec_alert)
                            except Exception as err:
                                logger.warning(f"Background alert task failed for zone '{target_zone_id}': {err}")

                        asyncio.create_task(
                            _handle_alert_background(alert_record, z_id, dict(risk_zone), list(neighbor_zones))
                        )

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

                # Quick async yield to keep event loop responsive
                await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            logger.info("Processing loop task was cancelled.")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in live orchestrator loop: {e}", exc_info=True)
        finally:
            if self.current_session_id == active_session:
                self.is_processing = False
                logger.info(f"Live orchestrator session '{active_session}' stopped.")
            else:
                logger.info(f"Stale orchestrator session '{active_session}' finalized without stopping active session '{self.current_session_id}'.")
