import { useState } from 'react';
import axios from 'axios';
import { 
  ShieldCheck, 
  AlertTriangle, 
  MapPin, 
  Compass, 
  Clock, 
  Sparkles, 
  RefreshCw, 
  Navigation,
  Activity,
  CheckCircle2
} from 'lucide-react';
import type { Alert, ZoneRisk } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import { getBackendHttpUrl } from '../services/apiConfig';

function timeAgo(dateString?: string) {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const getRiskColor = (level?: string) => {
  switch (level?.toLowerCase()) {
    case 'low': return { text: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)', badge: '#10b981' };
    case 'moderate': return { text: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', badge: '#f59e0b' };
    case 'high': return { text: '#fb923c', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.35)', badge: '#f97316' };
    case 'critical': return { text: '#f87171', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.45)', badge: '#ef4444' };
    default: return { text: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.3)', badge: '#8b5cf6' };
  }
};

function getAlertReasonings(alert: Alert, zoneRisk?: ZoneRisk): string[] {
  const reasonings: string[] = [];

  if (alert.reasoning && typeof alert.reasoning === 'string' && alert.reasoning.trim()) {
    reasonings.push(alert.reasoning.trim());
  }

  if (Array.isArray(alert.recommendations) && alert.recommendations.length > 0) {
    for (const rec of alert.recommendations) {
      if (rec.reasoning && typeof rec.reasoning === 'string' && rec.reasoning.trim()) {
        if (!reasonings.includes(rec.reasoning.trim())) {
          reasonings.push(rec.reasoning.trim());
        }
      }
    }
  }

  if (reasonings.length === 0) {
    const factors = alert.contributing_factors || zoneRisk?.contributing_factors;
    if (factors && typeof factors === 'object') {
      const parts: string[] = [];
      const density = factors.density_score;
      if (typeof density === 'number') {
        parts.push(`Crowd density estimated at ${Math.round(density * 100)}% capacity`);
      }
      if (factors.bottleneck_indicator && Number(factors.bottleneck_indicator) > 0.3) {
        parts.push('Bottleneck / exit congestion detected');
      }
      if (factors.flow_convergence_score && Number(factors.flow_convergence_score) > 0.3) {
        parts.push('Opposing / converging pedestrian flow');
      }
      if (factors.density_rate_of_change && Number(factors.density_rate_of_change) > 0.05) {
        parts.push('Rapid crowd influx observed');
      }
      if (factors.anomaly_indicator && Number(factors.anomaly_indicator) > 0.3) {
        parts.push('Irregular movement patterns identified');
      }

      if (parts.length > 0) {
        reasonings.push(parts.join('. ') + '.');
      }
    }
  }

  if (reasonings.length === 0) {
    const level = (alert.risk_level || alert.risk_level_at_trigger || zoneRisk?.risk_level || 'elevated').toLowerCase();
    reasonings.push(`Automated safety sensors detected elevated (${level}) crowd risk in this zone.`);
  }

  return reasonings;
}

interface AlertsScreenProps {
  onNavigateToMap?: () => void;
}

export default function AlertsScreen({ onNavigateToMap }: AlertsScreenProps) {
  const { selectedLanguage, activeAlerts, geofenceStatus, userLocation } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeZoneRisks = useAppStore((state) => state.activeZoneRisks);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const url = getBackendHttpUrl();
      await axios.get(`${url}/zones`);
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const sortedAlerts = [...activeAlerts].reverse();
  const isDangerActive = geofenceStatus?.inDangerZone || (geofenceStatus != null && geofenceStatus.distanceMeters != null && geofenceStatus.distanceMeters < 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
            {getTranslation(selectedLanguage, 'alerts')}
          </h1>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
            Live venue safety advisories and proximity tracking
          </p>
        </div>

        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px' }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'pulse-dot' : ''} />
          <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Geofence & Location Status Card */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
            <Compass size={16} />
            <span>YOUR LIVE VENUE TELEMETRY</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: userLocation ? '#34d399' : '#94a3b8' }} />
            <span className="font-mono" style={{ fontSize: '0.65rem', color: userLocation ? '#34d399' : 'var(--color-text-dim)' }}>
              {userLocation ? 'GPS ACTIVE' : 'NO GPS'}
            </span>
          </div>
        </div>

        <div className="glass-card-body" style={{ padding: '14px' }}>
          {isDangerActive ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.15) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              padding: '14px',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f87171',
                  flexShrink: 0
                }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#ffffff', display: 'block', marginBottom: '2px' }}>
                    {geofenceStatus?.inDangerZone ? 'You are inside a High-Risk Zone!' : getTranslation(selectedLanguage, 'nearHighRiskZone')}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.4 }}>
                    {geofenceStatus?.nearestDangerZoneId ? `Zone ${geofenceStatus.nearestDangerZoneId}` : ''}
                    {geofenceStatus?.distanceMeters ? ` • Distance: ~${geofenceStatus.distanceMeters}m away` : ''}
                    {' • Please follow evacuation path to designated safe exit.'}
                  </span>
                </div>
              </div>

              {onNavigateToMap && (
                <button 
                  onClick={onNavigateToMap}
                  className="btn-primary"
                  style={{
                    backgroundColor: '#ef4444',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                    padding: '9px 14px',
                    fontSize: '0.82rem',
                    width: '100%'
                  }}
                >
                  <Navigation size={15} />
                  <span>Show Evacuation Safe Route</span>
                </button>
              )}
            </div>
          ) : userLocation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34d399'
                  }}>
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: '#ffffff', display: 'block' }}>Safe Zone • Live Monitored</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)' }}>Low crowd pressure in current perimeter</span>
                  </div>
                </div>

                <span style={{ 
                  fontSize: '0.65rem', 
                  backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                  color: '#34d399', 
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '3px 8px', 
                  borderRadius: '99px', 
                  fontWeight: 700 
                }}>
                  NORMAL
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                padding: '8px 10px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', display: 'block' }}>NEAREST ZONE</span>
                  <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--color-accent-cyan)', fontWeight: 700 }}>
                    {geofenceStatus?.nearestZoneId || 'Zone A1'} 
                    {geofenceStatus?.nearestZoneDistanceMeters != null && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}> ({geofenceStatus.nearestZoneDistanceMeters < 1000 ? `${geofenceStatus.nearestZoneDistanceMeters}m` : `${(geofenceStatus.nearestZoneDistanceMeters/1000).toFixed(1)}km`})</span>
                    )}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', display: 'block' }}>GPS POSITION</span>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 600 }}>
                    {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                  </span>
                </div>
              </div>

              {onNavigateToMap && (
                <button
                  onClick={onNavigateToMap}
                  className="btn-secondary"
                  style={{ width: '100%', padding: '8px', fontSize: '0.78rem' }}
                >
                  <Navigation size={14} />
                  <span>View On Tactical Safe Map</span>
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={20} style={{ color: 'var(--color-text-dim)' }} />
              <div>
                <strong style={{ fontSize: '0.82rem', color: '#ffffff', display: 'block' }}>GPS Location Inactive</strong>
                <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                  Enable GPS in Settings tab to activate live evacuation geofencing.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Incident & Safety Alerts Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Activity size={15} style={{ color: 'var(--color-accent-violet)' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Safety Alerts ({sortedAlerts.length})
          </span>
        </div>

        {sortedAlerts.length === 0 ? (
          <div className="glass-card" style={{
            padding: '40px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              marginBottom: '4px'
            }}>
              <CheckCircle2 size={24} />
            </div>
            <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>
              {getTranslation(selectedLanguage, 'noActiveAlerts')}
            </strong>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-dim)' }}>
              All venue gates, corridors, and exits are operating at normal capacity.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedAlerts.map((alert, index) => {
              const zoneRisk = activeZoneRisks.find(z => z.zone_id === alert.zone_id);
              const riskLevel = alert.risk_level || alert.risk_level_at_trigger || zoneRisk?.risk_level || 'unknown';
              const riskPalette = getRiskColor(riskLevel);
              
              const summaryMsg = alert.message?.[selectedLanguage] || 
                                 alert.message?.en || 
                                 `Safety alert for Zone ${alert.zone_id}: Elevated risk observed.`;

              const reasonings = getAlertReasonings(alert, zoneRisk);

              return (
                <div 
                  key={`${alert.zone_id}-${index}`}
                  className="glass-card"
                  style={{
                    borderLeft: `4px solid ${riskPalette.badge}`,
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                          [{alert.zone_id}]
                        </span>
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: riskPalette.bg,
                          color: riskPalette.text,
                          border: `1px solid ${riskPalette.border}`,
                          textTransform: 'uppercase'
                        }}>
                          {riskLevel} RISK
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--color-text-dim)' }}>
                        <Clock size={11} />
                        <span className="font-mono">{timeAgo(alert.timestamp || alert.triggered_at)}</span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', lineHeight: 1.4 }}>
                      {summaryMsg}
                    </p>

                    {/* Reasoning Section */}
                    <div style={{
                      marginTop: '4px',
                      padding: '10px 12px',
                      backgroundColor: 'rgba(5, 8, 17, 0.6)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
                        <Sparkles size={12} />
                        <span>AI REASONING & TACTICAL ADVISORY</span>
                      </div>
                      {reasonings.map((reason, rIdx) => (
                        <p key={rIdx} style={{ margin: 0, fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                          {reason}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
