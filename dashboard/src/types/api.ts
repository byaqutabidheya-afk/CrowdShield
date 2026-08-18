/**
 * CrowdShield Dashboard API & WebSocket Type Definitions
 * Aligned with FastAPI Backend Schemas and WebSocket Streaming Frames
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ZoneConfig {
  zone_id: string;
  venue_id: string;
  bounds_normalized: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
    [key: string]: number;
  };
  max_expected_count: number;
  adjacency: string[];
  detection_confidence?: number | null;
  detection_imgsz?: number | null;
  model_weights_path?: string | null;
  is_exit?: boolean;
  created_at?: string;
}

export interface ZoneTrendPoint {
  timestamp: string;
  density_score: number;
  risk_score: number;
  crowd_count: number;
  avg_flow_speed: number;
  risk_level: string;
}

export interface AnnouncementRequest {
  base_message_en: string;
  target_languages?: string[];
  zone_id?: string;
  post_to_social?: boolean;
}

export interface TranslationDetail {
  text: string;
  audio_path?: string | null;
}

export interface AnnouncementResponse {
  base_message_en: string;
  translations: Record<string, TranslationDetail>;
  social_channels?: Record<string, any>;
  zone_id?: string;
  generated_at?: string;
}

export interface VoiceCommandResponse {
  transcribed_text: string;
  matched_intent: string;
  intent_params?: Record<string, any>;
  confidence: string;
  spoken_response?: string;
  note?: string;
}

export interface SignageWebhookRequest {
  zone_id: string;
  message: string;
  direction_arrows?: string[];
}

export interface SignageWebhookResponse {
  status: string;
  target_signage_ids: string[];
  zone_id: string;
  message: string;
  direction_arrows: string[];
}

export interface PreEventSimulationRequest {
  zones: Record<string, any>[];
  entry_zone_ids: string[];
  expected_attendance: number;
  arrival_duration_minutes?: number;
  num_steps?: number;
}

export interface PreEventSimulationResponse {
  steps?: Record<string, any>[];
  peak_density_zones?: Record<string, any>;
  bottlenecks_detected?: string[];
  recommendations?: string[];
  [key: string]: any;
}

export interface SentimentFlaggedPost {
  text: string;
  sentiment: string;
  urgency: string;
}

export interface SentimentAnalysisResponse {
  analyzed_at: string;
  posts_analyzed: number;
  aggregated_unrest_score: number;
  flagged_posts: SentimentFlaggedPost[];
}

export interface IncidentReportCreate {
  source?: 'citizen' | 'ai_generated' | string;
  zone_id?: string;
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
    [key: string]: any;
  };
  photo_url?: string;
  notes: string;
  ai_summary?: Record<string, any>;
}

export interface IncidentReport {
  id: string;
  source: 'citizen' | 'ai_generated' | string;
  zone_id?: string | null;
  gps_coordinates?: {
    latitude?: number;
    longitude?: number;
    [key: string]: any;
  } | null;
  photo_url?: string | null;
  notes: string;
  ai_summary?: Record<string, any> | null;
  submitted_at?: string;
}

export interface InterventionCreate {
  zone_id: string;
  action_taken: string;
  category?: string;
  triggered_by?: string;
}

export interface InterventionRecord {
  id: string;
  zone_id: string;
  action_taken: string;
  category: string;
  triggered_by: string;
  timestamp?: string;
}

export interface StartProcessingRequest {
  video_source: string;
  venue_id?: string;
  sample_every_n_frames?: number;
  zones_config?: Record<string, any>[];
}

export interface StartProcessingResponse {
  status: string;
  session_id?: string;
  venue_id?: string;
}

export interface ProcessingStatusResponse {
  is_active: boolean;
  session_id?: string;
  frames_processed?: number;
  elapsed_seconds?: number;
  max_risk_score_seen?: number;
  active_alert_count?: number;
  active_alerts?: Array<{ zone_id: string; risk_level: string }>;
  weather_state?: {
    weather_risk_multiplier: number;
    is_adverse_weather: boolean;
    details: {
      main: string | null;
      description: string | null;
      temp_c: number | null;
      humidity: number | null;
      wind_speed: number | null;
    };
  };
}

/* ==========================================================================
   WebSocket Live Streaming Frame Types
   ========================================================================== */

export interface CVZoneMetric {
  zone_id: string;
  bounds_normalized: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
    [key: string]: number;
  };
  crowd_count: number;
  density_score: number;
  avg_flow_speed: number;
  avg_flow_direction_deg: number;
  avg_flow_direction_label: string;
  reverse_flow_detected: boolean;
  bottleneck_detected: boolean;
  anomaly_flags: string[];
  tracked_ids_in_zone?: number[];
  [key: string]: any;
}

export interface CVFrameTotals {
  total_crowd_count: number;
  max_zone_density: number;
  highest_risk_zone_id?: string | null;
  [key: string]: any;
}

export interface CVData {
  zones: CVZoneMetric[];
  frame_totals: CVFrameTotals;
  [key: string]: any;
}

export interface RiskZoneMetric {
  zone_id: string;
  risk_score: number;
  risk_level: string; // "low" | "moderate" | "high" | "critical"
  contributing_factors: Record<string, any>;
  [key: string]: any;
}

export interface ResourceAllocationSuggestion {
  zone_id: string;
  suggestion_type: 'security_personnel' | 'medical_tent' | 'barricade_reconfiguration' | string;
  reason: string;
  priority: 'high' | 'medium' | 'low' | string;
  [key: string]: any;
}

export interface RiskData {
  zones: RiskZoneMetric[];
  predicted_crush_timeline?: any[];
  resource_allocation_suggestions?: ResourceAllocationSuggestion[];
  [key: string]: any;
}

export interface AlertData {
  id?: string;
  zone_id: string;
  triggered_at?: string;
  risk_level?: string;
  peak_risk_score?: number;
  recommendations: any[];
  [key: string]: any;
}

export interface WebSocketFrameMessage {
  timestamp: string | number;
  type: 'frame_update' | 'alert' | 'weather_alert' | string;
  cv_data?: CVData;
  risk_data?: RiskData;
  alert?: AlertData;
  new_alerts?: AlertData[];
  weather_data?: any;
  [key: string]: any;
}

export interface ZoneHistoryPoint {
  timestamp: string | number;
  density_score: number;
  risk_score: number;
}
