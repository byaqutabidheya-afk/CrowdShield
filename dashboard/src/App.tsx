import React, { useEffect, useState, useCallback } from 'react';
import { useLiveDataStore } from './store/liveDataStore';
import { useLiveWebSocket } from './hooks/useLiveWebSocket';

// Component Imports
import LiveVenueMap from './components/LiveVenueMap';
import DigitalTwin3D from './components/DigitalTwin3D';
import AnalyticsPanel from './components/AnalyticsPanel';
import AIInterventionPanel from './components/AIInterventionPanel';
import ResourceAllocationPanel from './components/ResourceAllocationPanel';
import IncidentReportsPanel from './components/IncidentReportsPanel';
import ExternalTriggersPanel from './components/ExternalTriggersPanel';
import VideoSourceWidget from './components/VideoSourceWidget';

export const App: React.FC = () => {
  // Activate live WebSocket stream
  const { connectionStatus, reconnect } = useLiveWebSocket();

  // Read store state
  const latestFrame = useLiveDataStore((state) => state.latestFrame);
  const activeAlerts = useLiveDataStore((state) => state.activeAlerts);
  const incidentReports = useLiveDataStore((state) => state.incidentReports);
  const resourceAllocationSuggestions = useLiveDataStore((state) => state.resourceAllocationSuggestions);
  const fetchIncidents = useLiveDataStore((state) => state.fetchIncidents);

  // Map View Mode state: '2d' (Leaflet Venue Map) vs '3d' (Interactive 3D Digital Twin)
  const [activeMapTab, setActiveMapTab] = useState<'2d' | '3d'>('2d');

  // Focused / Selected Zone state for live map panning & highlighting
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);

  // Live ticking clock for control room (IST - Indian Standard Time 12-hour AM/PM)
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    // Initial fetch of incident reports on mount
    fetchIncidents();

    const updateClock = () => {
      const now = new Date();
      const formattedIST = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).toUpperCase();
      setCurrentTime(`${formattedIST} IST`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  // Shared zone navigation callback handler for ExternalTriggersPanel voice command & IncidentReportsPanel map link
  const handleNavigateToZone = useCallback((zoneId: string) => {
    console.log(`[App] Shared Navigation Triggered: Panning map to zone '${zoneId}'`);
    setFocusedZoneId(zoneId);
  }, []);

  // Status dot color mapping
  const getStatusDotClass = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'disconnected':
      case 'error':
      default:
        return 'disconnected';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'LIVE // CONNECTED';
      case 'connecting':
        return 'CONNECTING...';
      case 'disconnected':
        return 'DISCONNECTED';
      case 'error':
        return 'CONNECTION ERROR';
      default:
        return 'OFFLINE';
    }
  };

  // Calculate live telemetry summary
  const totalHeadcount = latestFrame?.cv_data?.frame_totals?.total_crowd_count ?? 0;
  const maxDensity = latestFrame?.cv_data?.frame_totals?.max_zone_density ?? 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-dark)' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          height: '60px',
          backgroundColor: '#090d16',
          borderBottom: '1px solid var(--border-panel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        {/* Brand & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Tactical Shield Icon */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                stroke="var(--color-accent-cyan)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="rgba(6, 182, 212, 0.15)"
              />
              <circle cx="12" cy="11" r="3" fill="var(--color-accent-cyan)" />
            </svg>
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: '#f8fafc',
                fontFamily: 'var(--font-mono)',
              }}
            >
              CROWD<span style={{ color: 'var(--color-accent-cyan)' }}>SHIELD</span>
            </span>
          </div>

          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: 'var(--color-accent-blue)',
              textTransform: 'uppercase',
            }}
          >
            Command Center v2.0
          </span>
        </div>

        {/* Video Source Control & Viewport Mode Switcher & Telemetry Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Video Source Selector & Preview Widget */}
          <VideoSourceWidget />

          <div style={{ height: '26px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

          {/* Viewport Mode Switcher Pill */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#050811',
              padding: '0.2rem',
              borderRadius: '6px',
              border: '1px solid var(--border-panel)',
              gap: '0.2rem',
            }}
          >
            <button
              onClick={() => setActiveMapTab('2d')}
              style={{
                backgroundColor: activeMapTab === '2d' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: activeMapTab === '2d' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
                border: activeMapTab === '2d' ? '1px solid var(--color-accent-cyan)' : '1px solid transparent',
                borderRadius: '4px',
                padding: '0.25rem 0.65rem',
                fontSize: '0.725rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
              className="font-mono"
            >
              <span>🗺️</span>
              <span>2D Live Map</span>
            </button>

            <button
              onClick={() => setActiveMapTab('3d')}
              style={{
                backgroundColor: activeMapTab === '3d' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: activeMapTab === '3d' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
                border: activeMapTab === '3d' ? '1px solid var(--color-accent-cyan)' : '1px solid transparent',
                borderRadius: '4px',
                padding: '0.25rem 0.65rem',
                fontSize: '0.725rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
              className="font-mono"
            >
              <span>🎮</span>
              <span>3D Digital Twin</span>
            </button>
          </div>

          <div style={{ height: '26px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

          {/* Telemetry metrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>
                Headcount
              </span>
              <span className="font-mono" style={{ fontWeight: 700, color: '#f8fafc' }}>
                {totalHeadcount.toLocaleString()}
              </span>
            </div>

            <div style={{ height: '22px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>
                Peak Density
              </span>
              <span
                className="font-mono"
                style={{
                  fontWeight: 700,
                  color: maxDensity > 4.0 ? '#ef4444' : 'var(--color-accent-blue)',
                }}
              >
                {maxDensity.toFixed(2)} p/m²
              </span>
            </div>

            <div style={{ height: '22px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>
                Active Alerts
              </span>
              <span
                className="font-mono"
                style={{
                  fontWeight: 700,
                  color: activeAlerts.length > 0 ? '#ef4444' : '#10b981',
                }}
              >
                {activeAlerts.length}
              </span>
            </div>
          </div>

          <div style={{ height: '26px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

          {/* Connection Status Pill */}
          <div
            onClick={() => {
              if (connectionStatus !== 'connected') reconnect();
            }}
            title="Click to reconnect WebSocket if disconnected"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.65rem',
              borderRadius: '20px',
              backgroundColor: '#0d1322',
              border: '1px solid var(--border-panel)',
              cursor: connectionStatus !== 'connected' ? 'pointer' : 'default',
            }}
          >
            <span className={`status-dot ${getStatusDotClass()}`} />
            <span
              className="font-mono"
              style={{
                fontSize: '0.725rem',
                fontWeight: 700,
                color:
                  connectionStatus === 'connected'
                    ? '#10b981'
                    : connectionStatus === 'connecting'
                    ? '#f59e0b'
                    : '#ef4444',
              }}
            >
              {getStatusText()}
            </span>
          </div>

          {/* Indian Standard Time Clock (12-hour AM/PM) */}
          <div className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {currentTime || '12:00:00 AM IST'}
          </div>
        </div>
      </header>

      {/* Main Control Room Layout Grid */}
      <main
        style={{
          flex: 1,
          padding: '0.85rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: 'minmax(480px, 1.2fr) minmax(380px, 1fr)',
          gap: '0.85rem',
          overflow: 'hidden',
        }}
      >
        {/* UPPER ROW - PANEL 1: Primary Venue Viewport (2D Map / 3D Digital Twin) (Span 8) */}
        <section className="control-card" style={{ gridColumn: 'span 8', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>
                {activeMapTab === '2d' ? '📍' : '🎮'}
              </span>
              {activeMapTab === '2d' ? 'Live Venue Overwatch & Density Map (2D)' : '3D Venue Digital Twin & Crowd Simulator'}
            </div>

            <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.7rem' }}>
              {focusedZoneId && (
                <span style={{ color: 'var(--color-accent-blue)', fontWeight: 700 }}>
                  FOCUSED: [{focusedZoneId}]
                </span>
              )}

              {/* Viewport Toggle Switcher */}
              <div style={{ display: 'flex', backgroundColor: '#050811', padding: '0.12rem', borderRadius: '6px', border: '1px solid var(--border-panel)' }}>
                <button
                  onClick={() => setActiveMapTab('2d')}
                  style={{
                    backgroundColor: activeMapTab === '2d' ? '#1e293b' : 'transparent',
                    color: activeMapTab === '2d' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🗺️ 2D Map
                </button>
                <button
                  onClick={() => setActiveMapTab('3d')}
                  style={{
                    backgroundColor: activeMapTab === '3d' ? '#1e293b' : 'transparent',
                    color: activeMapTab === '3d' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🎮 3D Digital Twin
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: 0, position: 'relative' }}>
            {activeMapTab === '2d' ? (
              <LiveVenueMap
                selectedZoneId={focusedZoneId}
                isLiveFeedReady={connectionStatus === 'connected'}
              />
            ) : (
              <DigitalTwin3D />
            )}
          </div>
        </section>

        {/* UPPER ROW - PANEL 2: AI Interventions & Control Panel (Span 4) */}
        <section className="control-card" style={{ gridColumn: 'span 4', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>⚡</span>
              AI Interventions & Actions
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-accent-blue)' }}>
              {activeAlerts.length} ALERTS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflow: 'hidden' }}>
            <AIInterventionPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 3: Analytics & Trend Charts (Span 4) */}
        <section className="control-card" style={{ gridColumn: 'span 4', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>📊</span>
              Density & Risk Time-Series Analytics
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
              Recharts Engine
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflow: 'hidden' }}>
            <AnalyticsPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 4: Resource Allocation (Span 3) */}
        <section className="control-card" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>🛡️</span>
              Resource Deployments
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
              {resourceAllocationSuggestions.length} SUGGESTIONS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflow: 'hidden' }}>
            <ResourceAllocationPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 5: Incident Reports (Span 3) */}
        <section className="control-card" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>🚨</span>
              Incident Reports
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
              {incidentReports.length} REPORTS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflow: 'hidden' }}>
            <IncidentReportsPanel onNavigateToZone={handleNavigateToZone} />
          </div>
        </section>

        {/* LOWER ROW - PANEL 6: External Triggers & Voice Controls (Span 2) */}
        <section className="control-card" style={{ gridColumn: 'span 2', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span style={{ color: 'var(--color-accent-cyan)' }}>📢</span>
              Triggers & Voice
            </div>
            <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--color-accent-cyan)' }}>
              STT / WEBHOOK
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflow: 'hidden' }}>
            <ExternalTriggersPanel onNavigateToZone={handleNavigateToZone} />
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
