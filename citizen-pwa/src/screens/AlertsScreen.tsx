import { useState } from 'react';
import axios from 'axios';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';

// Simple time-ago helper to avoid adding heavy dependencies like date-fns
function timeAgo(dateString?: string) {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

// Phase 5 dashboard color palette for risk levels
const getRiskColor = (level?: string) => {
  switch (level?.toLowerCase()) {
    case 'low': return '#16a34a'; // Green
    case 'moderate': return '#eab308'; // Yellow
    case 'high': return '#f97316'; // Orange
    case 'critical': return '#dc2626'; // Red
    default: return '#64748b'; // Gray/Unknown
  }
};

interface AlertsScreenProps {
  onNavigateToMap?: () => void;
}

export default function AlertsScreen({ onNavigateToMap }: AlertsScreenProps) {
  const { selectedLanguage, activeAlerts, geofenceStatus } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Derive risk_level from activeZoneRisks if not directly in the alert
  // (In case the backend only sends risk_data.zones separately)
  const activeZoneRisks = useAppStore((state) => state.activeZoneRisks);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const url = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api';
      await axios.get(`${url}/zones`);
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sort most recent first based on timestamp (if available, otherwise by array order)
  const sortedAlerts = [...activeAlerts].reverse();

  return (
    <div style={{ paddingBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>{getTranslation(selectedLanguage, 'alerts')}</h1>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
            background: 'white',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          {isRefreshing ? '↻...' : '↻ Refresh'}
        </button>
      </div>
      {/* Geofence Status Header */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--text-color)' }}>Your Location Status</h3>

        {(geofenceStatus?.inDangerZone || (geofenceStatus != null && geofenceStatus.distanceMeters != null && geofenceStatus.distanceMeters < 50)) && (
          <div style={{
            backgroundColor: 'var(--error-color)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.25rem' }}>🚨</span>
              <strong style={{ fontSize: '0.875rem', lineHeight: 1.4 }}>
                {getTranslation(selectedLanguage, 'nearHighRiskZone')}. Consider moving to a safer area.
              </strong>
            </div>
          {onNavigateToMap && (
            <button 
              onClick={onNavigateToMap}
              style={{
                backgroundColor: 'white',
                border: 'none',
                color: 'var(--error-color)',
                padding: '10px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                width: '100%'
              }}
            >
              Show Safe Route
            </button>
          )}
        </div>
      )}
      </div>

      {sortedAlerts.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <span style={{ fontSize: '3rem', marginBottom: '16px' }}>✓</span>
          <h2 style={{ color: 'var(--text-color)' }}>{getTranslation(selectedLanguage, 'noActiveAlerts')}</h2>
          <p>Everything is operating normally.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sortedAlerts.map((alert, index) => {
            // Find current risk level from zone risks if not in alert
            const zoneRisk = activeZoneRisks.find(z => z.zone_id === alert.zone_id);
            const riskLevel = alert.risk_level || zoneRisk?.risk_level || 'unknown';
            
            // Get translation if available from multilingual pipeline, else fallback
            const summaryMsg = alert.message?.[selectedLanguage] || 
                               alert.message?.en || 
                               alert.recommendations?.[0]?.action || 
                               'Attention required in this area.';

            return (
              <div 
                key={`${alert.zone_id}-${index}`}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  borderLeft: `6px solid ${getRiskColor(riskLevel)}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '1.125rem' }}>Zone: {alert.zone_id}</strong>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)',
                    fontWeight: 500
                  }}>
                    {timeAgo(alert.timestamp)}
                  </span>
                </div>
                
                <div style={{ 
                  display: 'inline-block',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: getRiskColor(riskLevel) + '22', // 22 is hex opacity
                  color: getRiskColor(riskLevel),
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  marginBottom: '12px'
                }}>
                  {riskLevel} RISK
                </div>

                <p style={{ margin: 0, fontWeight: 500 }}>
                  {summaryMsg}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
