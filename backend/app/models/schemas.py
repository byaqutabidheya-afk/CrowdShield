"""
Pydantic Schemas for CrowdShield FastAPI Backend.

Includes:
1. Database table schemas mirroring schema.sql (Request/Response validation)
2. AI Core Pipeline JSON output schemas for Phases 1, 2, and 3 (CVFrameOutput,
   RiskEngineOutput, RecommendationOutput, MultilingualAlertOutput,
   SentimentOutput, VoiceCommandOutput).
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


# ==============================================================================
# 1. Database Table Schemas (mirroring schema.sql)
# ==============================================================================

# ------------------------------------------------------------------------------
# Zones (zones)
# ------------------------------------------------------------------------------
class ZoneBase(BaseModel):
    zone_id: str
    venue_id: str
    bounds_normalized: Dict[str, float]
    max_expected_count: int = 50
    adjacency: List[str] = Field(default_factory=list)
    detection_confidence: Optional[float] = None
    detection_imgsz: Optional[int] = None
    model_weights_path: Optional[str] = None


class ZoneCreate(ZoneBase):
    pass


class ZoneUpdate(BaseModel):
    venue_id: Optional[str] = None
    bounds_normalized: Optional[Dict[str, float]] = None
    max_expected_count: Optional[int] = None
    adjacency: Optional[List[str]] = None
    detection_confidence: Optional[float] = None
    detection_imgsz: Optional[int] = None
    model_weights_path: Optional[str] = None


class ZoneResponse(ZoneBase):
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Venue Configs (venue_configs)
# ------------------------------------------------------------------------------
class VenueConfigBase(BaseModel):
    venue_id: str
    diffusion_rate: float = 0.15
    decay_rate: float = 0.05


class VenueConfigCreate(VenueConfigBase):
    pass


class VenueConfigUpdate(BaseModel):
    diffusion_rate: Optional[float] = None
    decay_rate: Optional[float] = None


class VenueConfigResponse(VenueConfigBase):
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Crowd Metrics (crowd_metrics)
# ------------------------------------------------------------------------------
class CrowdMetricsBase(BaseModel):
    zone_id: str
    timestamp: datetime
    crowd_count: int
    density_score: float
    avg_flow_speed: float
    avg_flow_direction_deg: float
    risk_score: float
    risk_level: str
    anomaly_flags: List[str] = Field(default_factory=list)
    contributing_factors: Dict[str, Any] = Field(default_factory=dict)


class CrowdMetricsCreate(CrowdMetricsBase):
    pass


class CrowdMetricsResponse(CrowdMetricsBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Risk Alerts (risk_alerts)
# ------------------------------------------------------------------------------
class RiskAlertBase(BaseModel):
    zone_id: str
    triggered_at: datetime
    resolved_at: Optional[datetime] = None
    peak_risk_score: float
    risk_level_at_trigger: str
    recommendations: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "active"


class RiskAlertCreate(RiskAlertBase):
    pass


class RiskAlertUpdate(BaseModel):
    resolved_at: Optional[datetime] = None
    peak_risk_score: Optional[float] = None
    risk_level_at_trigger: Optional[str] = None
    recommendations: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None


class RiskAlertResponse(RiskAlertBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Incident Reports (incident_reports)
# ------------------------------------------------------------------------------
class IncidentReportBase(BaseModel):
    source: str = "citizen"  # 'citizen' or 'ai_generated'
    zone_id: Optional[str] = None
    gps_coordinates: Optional[Dict[str, float]] = None
    photo_url: Optional[str] = None
    notes: str
    ai_summary: Optional[Dict[str, Any]] = None
    client_device_id: Optional[str] = None


class IncidentReportCreate(IncidentReportBase):
    pass


class IncidentReportUpdate(BaseModel):
    source: Optional[str] = None
    zone_id: Optional[str] = None
    gps_coordinates: Optional[Dict[str, float]] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    ai_summary: Optional[Dict[str, Any]] = None


class IncidentReportResponse(IncidentReportBase):
    id: UUID
    submitted_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Interventions (interventions)
# ------------------------------------------------------------------------------
class InterventionBase(BaseModel):
    zone_id: str
    action_taken: str
    category: str
    triggered_by: str  # 'operator' or 'ai_suggested'


class InterventionCreate(InterventionBase):
    pass


class InterventionResponse(InterventionBase):
    id: UUID
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------------------
# Devices (devices)
# ------------------------------------------------------------------------------
class DeviceBase(BaseModel):
    push_token: str
    last_known_location: Optional[Dict[str, float]] = None


class DeviceRegister(DeviceBase):
    pass


class DeviceUpdate(BaseModel):
    last_known_location: Optional[Dict[str, float]] = None


class DeviceResponse(DeviceBase):
    push_token: str
    last_known_location: Optional[Dict[str, float]] = None
    registered_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 2. AI/ML Core Pipeline JSON Output Schemas (Phases 1, 2, and 3)
# ==============================================================================

# ------------------------------------------------------------------------------
# Phase 1: CV & Video Analytics Pipeline (CVFrameOutput)
# ------------------------------------------------------------------------------
class BoundsNormalized(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float


class CVZoneMetric(BaseModel):
    zone_id: str
    bounds_normalized: BoundsNormalized | Dict[str, float]
    crowd_count: int
    density_score: float
    avg_flow_speed: float
    avg_flow_direction_deg: float
    avg_flow_direction_label: str = ""
    reverse_flow_detected: bool = False
    bottleneck_detected: bool = False
    anomaly_flags: List[str] = Field(default_factory=list)
    tracked_ids_in_zone: List[int] = Field(default_factory=list)


class CVFrameTotals(BaseModel):
    total_crowd_count: int
    max_zone_density: float
    highest_risk_zone_id: Optional[str] = None


class CVFrameOutput(BaseModel):
    timestamp: datetime | str
    frame_number: int
    source_id: str
    zones: List[CVZoneMetric]
    frame_totals: CVFrameTotals


# ------------------------------------------------------------------------------
# Phase 2: Risk Prediction & Simulation Engine (RiskEngineOutput)
# ------------------------------------------------------------------------------
class ContributingFactors(BaseModel):
    density_score: float
    density_rate_of_change: float = 0.0
    flow_convergence_score: float = 0.0
    bottleneck_indicator: float = 0.0
    anomaly_indicator: float = 0.0


class RiskZoneMetric(BaseModel):
    zone_id: str
    risk_score: float
    risk_level: str
    contributing_factors: ContributingFactors | Dict[str, float]


class PanicSimulatedStep(BaseModel):
    step: int
    time_offset_seconds: int
    zone_risk_scores: Dict[str, float]


class PanicPropagation(BaseModel):
    simulated_steps: List[PanicSimulatedStep]


class PredictedCrushTimelineItem(BaseModel):
    zone_id: str
    predicted_critical_at_seconds: int
    confidence: str


class ResourceAllocationSuggestion(BaseModel):
    zone_id: str
    suggestion_type: str
    reason: str
    priority: str


class RouteBlockagePrediction(BaseModel):
    route_id: str
    zone_sequence: List[str]
    at_risk_of_blockage: bool
    blocking_zone_id: Optional[str] = None
    reason: Optional[str] = None


class RiskEngineOutput(BaseModel):
    timestamp: datetime | str
    zones: List[RiskZoneMetric]
    panic_propagation: Optional[PanicPropagation] = None
    predicted_crush_timeline: List[PredictedCrushTimelineItem] = Field(default_factory=list)
    resource_allocation_suggestions: List[ResourceAllocationSuggestion] = Field(default_factory=list)
    route_blockage_predictions: List[RouteBlockagePrediction] = Field(default_factory=list)


# ------------------------------------------------------------------------------
# Phase 3: Generative AI, Recommendations & Voice Pipeline Outputs
# ------------------------------------------------------------------------------

# 1. RecommendationOutput
class RecommendationItem(BaseModel):
    action: str
    category: str
    urgency: str
    reasoning: str


class RecommendationOutput(BaseModel):
    zone_id: str
    risk_level: str
    recommendations: List[RecommendationItem]
    generated_at: datetime | str


# 2. MultilingualAlertOutput
class TranslationDetail(BaseModel):
    text: str
    audio_path: Optional[str] = None


class MultilingualAlertOutput(BaseModel):
    base_message_en: str
    translations: Dict[str, TranslationDetail]
    generated_at: datetime | str


# 3. VoiceCommandOutput
class VoiceCommandOutput(BaseModel):
    transcribed_text: str
    matched_intent: str
    intent_params: Dict[str, Any] = Field(default_factory=dict)
    confidence: str


# 4. SentimentOutput
class FlaggedPost(BaseModel):
    text: str
    sentiment: str
    urgency: str


class SentimentOutput(BaseModel):
    analyzed_at: datetime | str
    posts_analyzed: int
    aggregated_unrest_score: float
    flagged_posts: List[FlaggedPost] = Field(default_factory=list)
