import { create } from 'zustand';
import { getIncidents, getInterventions } from '../api/client';
import type {
  WebSocketFrameMessage,
  ZoneHistoryPoint,
  AlertData,
  ResourceAllocationSuggestion,
  IncidentReport,
  InterventionRecord,
  ConnectionStatus,
} from '../types/api';

const MAX_ZONE_HISTORY_POINTS = 100;

const resourceSuggestionKey = (suggestion: ResourceAllocationSuggestion): string =>
  `${suggestion.zone_id}|${suggestion.suggestion_type}|${suggestion.reason}`;

export interface LiveDataState {
  // State
  latestFrame: WebSocketFrameMessage | null;
  zoneHistory: Map<string, ZoneHistoryPoint[]>;
  activeAlerts: AlertData[];
  resourceAllocationSuggestions: ResourceAllocationSuggestion[];
  dismissedResourceAllocationSuggestionKeys: string[];
  incidentReports: IncidentReport[];
  interventions: InterventionRecord[];
  connectionStatus: ConnectionStatus;

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  processWebSocketMessage: (message: WebSocketFrameMessage) => void;
  fetchIncidents: (params?: { source?: string; zone_id?: string }) => Promise<void>;
  setIncidentReports: (reports: IncidentReport[]) => void;
  fetchInterventions: (params?: { zone_id?: string }) => Promise<void>;
  setInterventions: (interventions: InterventionRecord[]) => void;
  addIntervention: (intervention: InterventionRecord) => void;
  dismissResourceAllocationSuggestion: (suggestion: ResourceAllocationSuggestion) => void;
  dismissIntervention: (id: string) => void;
  dismissAlert: (alertIdOrZoneId: string) => void;
  clearAlerts: () => void;
  resetStreamData: () => void;
  weatherState?: {
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
  setWeatherState: (weatherState: any) => void;
}

export const useLiveDataStore = create<LiveDataState>((set, get) => ({
  // Initial state — starts in 'connecting' mode while WebSocket handshakes on page load
  latestFrame: null,
  zoneHistory: new Map<string, ZoneHistoryPoint[]>(),
  activeAlerts: [],
  resourceAllocationSuggestions: [],
  dismissedResourceAllocationSuggestionKeys: [],
  incidentReports: [],
  interventions: [],
  connectionStatus: 'connecting',
  weatherState: undefined,

  // Set weather state
  setWeatherState: (weatherState: any) => {
    set({ weatherState });
  },

  // Set WebSocket connection status
  setConnectionStatus: (status: ConnectionStatus) => {
    set({ connectionStatus: status });
  },

  // Process incoming WebSocket frame message
  processWebSocketMessage: (message: WebSocketFrameMessage) => {
    const timestamp = message.timestamp || new Date().toISOString();

    // 1. Keep generated resource suggestions until the operator dismisses them.
    // Live frames frequently contain an empty suggestions array, which must not
    // clear deployments that were already generated in this dashboard session.
    const incomingSuggestions = message.risk_data?.resource_allocation_suggestions ?? [];
    const currentSuggestions = get().resourceAllocationSuggestions;
    const dismissedSuggestionKeys = new Set(get().dismissedResourceAllocationSuggestionKeys);
    const newSuggestions = [...currentSuggestions];
    for (const suggestion of incomingSuggestions) {
      const key = resourceSuggestionKey(suggestion);
      if (dismissedSuggestionKeys.has(key)) continue;
      const existingIndex = newSuggestions.findIndex((item) => resourceSuggestionKey(item) === key);
      if (existingIndex >= 0) {
        newSuggestions[existingIndex] = suggestion;
      } else {
        newSuggestions.push(suggestion);
      }
    }

    // 2. Process alerts (avoiding duplicates by zone_id — an alert already in activeAlerts for that zone_id is updated in-place)
    const incomingAlerts: AlertData[] = [];
    if (message.alert) {
      incomingAlerts.push(message.alert);
    }
    if (Array.isArray(message.new_alerts)) {
      incomingAlerts.push(...message.new_alerts);
    }

    let updatedActiveAlerts = [...get().activeAlerts];
    for (const alert of incomingAlerts) {
      if (!alert.zone_id) continue;
      const existingIndex = updatedActiveAlerts.findIndex((a) => a.zone_id === alert.zone_id);
      if (existingIndex >= 0) {
        // Replace / update existing alert for this zone_id
        updatedActiveAlerts[existingIndex] = { ...updatedActiveAlerts[existingIndex], ...alert };
      } else {
        // Add new alert
        updatedActiveAlerts.unshift(alert);
      }
    }

    // 3. Update zoneHistory Map (capped at 100 points per zone)
    const nextZoneHistory = new Map<string, ZoneHistoryPoint[]>(get().zoneHistory);

    // Collect all unique zone IDs from cv_data and risk_data
    const cvZones = message.cv_data?.zones || [];
    const riskZones = message.risk_data?.zones || [];

    const riskMap = new Map<string, number>();
    for (const rZone of riskZones) {
      riskMap.set(rZone.zone_id, rZone.risk_score ?? 0);
    }

    for (const cvZone of cvZones) {
      const zoneId = cvZone.zone_id || (cvZone as any).id;
      if (!zoneId) continue;
      const densityScore = cvZone.density_score ?? 0;
      const riskScore = riskMap.get(zoneId) ?? 0;

      const existingPoints = nextZoneHistory.get(zoneId) || [];
      const newPoint: ZoneHistoryPoint = {
        timestamp,
        density_score: densityScore,
        risk_score: riskScore,
      };

      const updatedPoints = [...existingPoints, newPoint];
      if (updatedPoints.length > MAX_ZONE_HISTORY_POINTS) {
        updatedPoints.splice(0, updatedPoints.length - MAX_ZONE_HISTORY_POINTS);
      }

      nextZoneHistory.set(zoneId, updatedPoints);
    }

    // Also continuously process risk zones that might not have been in cv_data
    for (const rZone of riskZones) {
      const zoneId = rZone.zone_id || (rZone as any).id;
      if (!zoneId) continue;
      if (!cvZones.some((z) => (z.zone_id || (z as any).id) === zoneId)) {
        const existingPoints = nextZoneHistory.get(zoneId) || [];
        const newPoint: ZoneHistoryPoint = {
          timestamp,
          density_score: rZone.contributing_factors?.density_score ?? 0,
          risk_score: rZone.risk_score ?? 0,
        };
        const updatedPoints = [...existingPoints, newPoint];
        if (updatedPoints.length > MAX_ZONE_HISTORY_POINTS) {
          updatedPoints.splice(0, updatedPoints.length - MAX_ZONE_HISTORY_POINTS);
        }
        nextZoneHistory.set(zoneId, updatedPoints);
      }
    }

    set({
      latestFrame: message,
      resourceAllocationSuggestions: newSuggestions,
      activeAlerts: updatedActiveAlerts,
      zoneHistory: nextZoneHistory,
    });
  },

  // Fetch incident reports from backend REST API
  fetchIncidents: async (params?: { source?: string; zone_id?: string }) => {
    try {
      const reports = await getIncidents(params);
      set({ incidentReports: reports });
    } catch (error) {
      console.error('Failed to fetch incident reports for liveDataStore:', error);
    }
  },

  // Directly set incident reports
  setIncidentReports: (reports: IncidentReport[]) => {
    set({ incidentReports: reports });
  },

  // Fetch logged manual and AI interventions from backend REST API
  fetchInterventions: async (params?: { zone_id?: string }) => {
    try {
      const records = await getInterventions(params);
      if (Array.isArray(records)) {
        set({ interventions: records });
      }
    } catch (error) {
      console.error('Failed to fetch interventions for liveDataStore:', error);
    }
  },

  // Directly set interventions list
  setInterventions: (interventions: InterventionRecord[]) => {
    set({ interventions });
  },

  // Prepend a newly logged intervention immediately into state
  addIntervention: (intervention: InterventionRecord) => {
    set((state) => ({
      interventions: [intervention, ...state.interventions.filter((i) => i.id !== intervention.id)],
    }));
  },

  // Keep a deployment dismissed for this page session so later live frames do
  // not immediately add it back. A full page reload resets this state.
  dismissResourceAllocationSuggestion: (suggestion: ResourceAllocationSuggestion) => {
    const key = resourceSuggestionKey(suggestion);
    set((state) => ({
      resourceAllocationSuggestions: state.resourceAllocationSuggestions.filter(
        (item) => resourceSuggestionKey(item) !== key,
      ),
      dismissedResourceAllocationSuggestionKeys: state.dismissedResourceAllocationSuggestionKeys.includes(key)
        ? state.dismissedResourceAllocationSuggestionKeys
        : [...state.dismissedResourceAllocationSuggestionKeys, key],
    }));
  },

  // Dismiss / close a single recorded intervention by ID
  dismissIntervention: (id: string) => {
    set((state) => ({
      interventions: state.interventions.filter((i) => i.id !== id),
    }));
  },

  // Dismiss a single alert by ID or zone_id
  dismissAlert: (alertIdOrZoneId: string) => {
    set((state) => ({
      activeAlerts: state.activeAlerts.filter(
        (alert) => alert.id !== alertIdOrZoneId && alert.zone_id !== alertIdOrZoneId
      ),
    }));
  },

  // Clear all active alerts
  clearAlerts: () => {
    set({ activeAlerts: [] });
  },

  // Reset stream data and zone histories for new live video sessions
  resetStreamData: () => {
    set({
      latestFrame: null,
      activeAlerts: [],
      zoneHistory: new Map<string, ZoneHistoryPoint[]>(),
    });
  },
}));

export default useLiveDataStore;
