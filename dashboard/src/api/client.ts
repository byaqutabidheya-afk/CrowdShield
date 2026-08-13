import axios from 'axios';
import type {
  ZoneConfig,
  ZoneTrendPoint,
  AnnouncementRequest,
  AnnouncementResponse,
  VoiceCommandResponse,
  SignageWebhookRequest,
  SignageWebhookResponse,
  PreEventSimulationRequest,
  PreEventSimulationResponse,
  SentimentAnalysisResponse,
  IncidentReportCreate,
  IncidentReport,
  InterventionCreate,
  InterventionRecord,
  StartProcessingRequest,
  StartProcessingResponse,
  ProcessingStatusResponse,
} from '../types/api';

/**
 * Base URL for CrowdShield REST backend.
 * Configurable via environment variable VITE_BACKEND_HTTP_URL, defaulting to http://localhost:8000/api
 */
const BASE_URL = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api';

/**
 * Configured Axios Instance for CrowdShield REST API
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  // No default Content-Type — let each request set its own.
  // FormData requests need the browser to set multipart/form-data with boundary automatically.
});

/**
 * Fetch venue zone configurations.
 * GET /zones
 */
export const getZones = async (venueId?: string): Promise<ZoneConfig[]> => {
  const response = await apiClient.get<ZoneConfig[]>('/zones', {
    params: venueId ? { venue_id: venueId } : undefined,
  });
  return response.data;
};

/**
 * Fetch historical trend metrics for a specific zone.
 * GET /trends/{zone_id}
 */
export const getTrends = async (
  zoneId: string,
  params?: { start_time?: string; end_time?: string }
): Promise<ZoneTrendPoint[]> => {
  const response = await apiClient.get<ZoneTrendPoint[]>(`/trends/${encodeURIComponent(zoneId)}`, {
    params,
  });
  return response.data;
};

/**
 * Create multilingual safety announcement and social dispatches.
 * POST /announcements
 */
export const postAnnouncement = async (
  data: AnnouncementRequest
): Promise<AnnouncementResponse> => {
  const response = await apiClient.post<AnnouncementResponse>('/announcements', data);
  return response.data;
};

/**
 * Upload operator voice command audio blob for transcription & intent classification.
 * POST /voice-command
 */
export const postVoiceCommand = async (
  audioBlob: Blob | File
): Promise<VoiceCommandResponse> => {
  const formData = new FormData();
  const filename = audioBlob instanceof File ? audioBlob.name : 'voice_command.wav';
  formData.append('file', audioBlob, filename);

  const response = await apiClient.post<VoiceCommandResponse>('/voice-command', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Trigger digital signage message update webhook.
 * POST /webhooks/signage
 */
export const postSignageWebhook = async (
  data: SignageWebhookRequest
): Promise<SignageWebhookResponse> => {
  const response = await apiClient.post<SignageWebhookResponse>('/webhooks/signage', data);
  return response.data;
};

/**
 * Run offline pre-event crowd buildup simulation.
 * POST /simulations/pre-event
 */
export const postPreEventSimulation = async (
  data: PreEventSimulationRequest
): Promise<PreEventSimulationResponse> => {
  const response = await apiClient.post<PreEventSimulationResponse>('/simulations/pre-event', data);
  return response.data;
};

/**
 * Fetch aggregated social media crowd sentiment and unrest score.
 * GET /sentiment
 */
export const getSentiment = async (): Promise<SentimentAnalysisResponse> => {
  const response = await apiClient.get<SentimentAnalysisResponse>('/sentiment');
  return response.data;
};

/**
 * Submit a new incident report (citizen or AI-generated).
 * POST /incidents
 */
export const postIncident = async (
  data: IncidentReportCreate
): Promise<IncidentReport> => {
  const response = await apiClient.post<IncidentReport>('/incidents', data);
  return response.data;
};

/**
 * Fetch recent incident reports (filtered by source or zone_id if specified).
 * GET /incidents
 */
export const getIncidents = async (params?: {
  source?: string;
  zone_id?: string;
}): Promise<IncidentReport[]> => {
  const response = await apiClient.get<IncidentReport[]>('/incidents', { params });
  return response.data;
};

/**
 * Log a manual intervention action.
 * POST /interventions
 */
export const postIntervention = async (
  data: InterventionCreate
): Promise<InterventionRecord> => {
  const response = await apiClient.post<InterventionRecord>('/interventions', data);
  return response.data;
};

/**
 * Start backend live video processing loop.
 * POST /processing/start
 */
export const startVideoProcessing = async (
  data: StartProcessingRequest
): Promise<StartProcessingResponse> => {
  const response = await apiClient.post<StartProcessingResponse>('/processing/start', data);
  return response.data;
};

/**
 * Upload local video file to backend and launch Python CV Pipeline processing loop.
 * POST /processing/upload
 */
export const uploadVideoAndStartProcessing = async (
  file: File,
  venueId: string = 'cam_01'
): Promise<StartProcessingResponse> => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('venue_id', venueId);

  // Do NOT set Content-Type manually — the browser must set it automatically
  // so the multipart boundary is included (e.g. multipart/form-data; boundary=----xyz).
  // Setting it manually omits the boundary and the server cannot parse the request.
  const response = await apiClient.post<StartProcessingResponse>('/processing/upload', formData);
  return response.data;
};

/**
 * Stop backend live video processing loop.
 * POST /processing/stop
 */
export const stopVideoProcessing = async (): Promise<{ status: string; session_id?: string }> => {
  const response = await apiClient.post('/processing/stop');
  return response.data;
};

/**
 * Fetch live video processing status.
 * GET /processing/status
 */
export const getVideoProcessingStatus = async (): Promise<ProcessingStatusResponse> => {
  const response = await apiClient.get<ProcessingStatusResponse>('/processing/status');
  return response.data;
};

export default apiClient;
