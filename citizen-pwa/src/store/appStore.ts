import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { showLocalNotification } from '../services/push';
import { getTranslation } from '../i18n/translations';

export interface Location {
  lat: number;
  lng: number;
}

export interface ZoneRisk {
  zone_id: string;
  risk_score: number;
  risk_level: string;
  contributing_factors: Record<string, number>;
}

export interface Recommendation {
  action: string;
  category?: string;
  urgency?: string;
  reasoning?: string;
}

export interface Alert {
  zone_id: string;
  risk_level?: 'low' | 'moderate' | 'high' | 'critical' | string;
  risk_level_at_trigger?: string;
  peak_risk_score?: number;
  risk_score?: number;
  timestamp?: string;
  triggered_at?: string;
  message?: {
    en?: string;
    [key: string]: string | undefined;
  };
  recommendations?: Recommendation[];
  reasoning?: string;
  contributing_factors?: Record<string, number>;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface AppState {
  userLocation: Location | null;
  activeZoneRisks: ZoneRisk[];
  selectedLanguage: string;
  activeAlerts: Alert[];
  connectionStatus: ConnectionStatus;
  clientDeviceId: string;
  geofenceStatus: {
    inDangerZone: boolean;
    nearestDangerZoneId: string | null;
    distanceMeters: number | null;
    nearestZoneId?: string | null;
    nearestZoneDistanceMeters?: number | null;
    currentZoneId?: string | null;
  } | null;
  inAppToast: { id: string; title: string; body: string; type?: 'alert' | 'info' } | null;

  // Actions
  setUserLocation: (location: Location | null) => void;
  setActiveZoneRisks: (risks: ZoneRisk[]) => void;
  setSelectedLanguage: (lang: string) => void;
  setActiveAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setGeofenceStatus: (status: AppState['geofenceStatus']) => void;
  triggerInAppNotification: (title: string, body: string, type?: 'alert' | 'info') => void;
  dismissInAppNotification: () => void;
}

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if randomUUID throws
    }
  }
  return 'device_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      userLocation: null,
      activeZoneRisks: [],
      selectedLanguage: 'en',
      activeAlerts: [],
      connectionStatus: 'disconnected',
      clientDeviceId: generateDeviceId(),
      geofenceStatus: null,
      inAppToast: null,

      setUserLocation: (location) => set({ userLocation: location }),
      setActiveZoneRisks: (risks) => set({ activeZoneRisks: risks }),
      setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
      setActiveAlerts: (alerts) => set({ activeAlerts: alerts }),
      addAlert: (alert) => set((state) => ({ activeAlerts: [...state.activeAlerts, alert] })),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      triggerInAppNotification: (title, body, type = 'alert') => {
        const id = 'notif_' + Date.now();
        set({ inAppToast: { id, title, body, type } });
        try {
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch {
          // ignore vibration error
        }
      },
      dismissInAppNotification: () => set({ inAppToast: null }),
      setGeofenceStatus: (status) => {
        const state = get();
        const currentZone = state.geofenceStatus?.inDangerZone ? state.geofenceStatus.nearestDangerZoneId : null;
        const newZone = status?.inDangerZone ? status.nearestDangerZoneId : null;

        // Transition: entering a danger zone (either from safe, or moving directly to a different danger zone)
        if (newZone && currentZone !== newZone) {
          const title = getTranslation(state.selectedLanguage, 'alerts');
          const body = getTranslation(state.selectedLanguage, 'nearHighRiskZone');
          showLocalNotification(title, `${body} (${newZone})`);
          get().triggerInAppNotification(title, `${body} (${newZone})`, 'alert');
        }

        set({ geofenceStatus: status });
      },
    }),
    {
      name: 'citizen-app-storage',
      // Only persist selectedLanguage and clientDeviceId to localStorage
      partialize: (state) => ({
        selectedLanguage: state.selectedLanguage,
        clientDeviceId: state.clientDeviceId,
      }),
    }
  )
);
