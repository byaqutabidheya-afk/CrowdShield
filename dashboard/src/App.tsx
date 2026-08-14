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
import WeatherWidget from './components/WeatherWidget';
import { AnnouncementsPanel } from './components/AnnouncementsPanel';
import SplashScreen from './components/SplashScreen';

type DashboardIconName = 'map' | 'ai' | 'analytics' | 'resources' | 'incident' | 'triggers';

const DashboardIcon: React.FC<{ name: DashboardIconName }> = ({ name }) => {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

  const paths: Record<DashboardIconName, React.ReactNode> = {
    map: <><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" /><path d="M9 4v13.5M15 6.5V20" /><circle cx="12" cy="11" r="1.7" /></>,
    ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><path d="m12 7 1.4 3.6L17 12l-3.6 1.4L12 17l-1.4-3.6L7 12l3.6-1.4L12 7Z" /></>,
    analytics: <><path d="M4 19V5M4 19h17" /><path d="m7 15 3-4 3 2 5-6" /><circle cx="7" cy="15" r="1" /><circle cx="10" cy="11" r="1" /><circle cx="13" cy="13" r="1" /><circle cx="18" cy="7" r="1" /></>,
    resources: <><path d="m12 3 7 3.5v6.8c0 3.5-2.8 6.4-7 7.7-4.2-1.3-7-4.2-7-7.7V6.5L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
    incident: <><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
    triggers: <><path d="M4 12h3l2-5 3 10 2-5h6" /><circle cx="4" cy="12" r="1" /><circle cx="20" cy="12" r="1" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
};

export const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
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

  useEffect(() => {
    const scrollContainer = document.getElementById('crowdshield-scroll-container');
    const revealTargets = scrollContainer?.querySelectorAll<HTMLElement>('.scroll-reveal');

    if (!scrollContainer || !revealTargets?.length) return;

    const restartFocus = (target: HTMLElement, direction: 'up' | 'down') => {
      target.classList.remove('is-visible');
      target.classList.toggle('scroll-enter-up', direction === 'up');
      void target.offsetWidth;
      target.classList.add('is-visible');
    };

    let frameId = 0;
    let idleTimer = 0;
    const getScrollPosition = () => scrollContainer.scrollTop || window.scrollY;
    let previousScrollTop = getScrollPosition();
    let lastDirection: 'up' | 'down' | null = null;
    const focusedWhileScrollingUp = new Set<HTMLElement>();
    const focusedWhileScrollingDown = new Set<HTMLElement>();

    const revealVisiblePanels = () => {
      frameId = 0;
      const viewportBottom = window.innerHeight * 0.94;
      const currentScrollTop = getScrollPosition();
      const direction: 'up' | 'down' = currentScrollTop < previousScrollTop ? 'up' : 'down';
      previousScrollTop = currentScrollTop;
      const focusedPanels = direction === 'up' ? focusedWhileScrollingUp : focusedWhileScrollingDown;

      // When the direction changes, treat panels already on screen as the current
      // section. Only panels entering after this point should animate.
      if (lastDirection !== direction) {
        revealTargets.forEach((target) => {
          const bounds = target.getBoundingClientRect();
          if (bounds.top < viewportBottom && bounds.bottom > 0) focusedPanels.add(target);
        });
        lastDirection = direction;
      }

      revealTargets.forEach((target) => {
        const bounds = target.getBoundingClientRect();
        const isInViewport = bounds.top < viewportBottom && bounds.bottom > 0;
        if (isInViewport) {
          if (!focusedPanels.has(target)) {
            restartFocus(target, direction);
            focusedPanels.add(target);
          }
        } else {
          target.classList.remove('is-visible');
          focusedWhileScrollingUp.delete(target);
          focusedWhileScrollingDown.delete(target);
        }
      });
    };

    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(revealVisiblePanels);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const direction = lastDirection ?? 'down';
        const visiblePanels = Array.from(revealTargets)
          .filter((target) => {
            const bounds = target.getBoundingClientRect();
            return bounds.top < window.innerHeight * 0.94 && bounds.bottom > 0;
          })
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

        visiblePanels.forEach((target, index) => {
          target.style.setProperty('--scroll-focus-delay', `${index * 110}ms`);
          restartFocus(target, direction);
        });
      }, 140);
    };

    revealVisiblePanels();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
      window.clearTimeout(idleTimer);
    };
  }, []);

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
    <div
      className={`crowdshield-dashboard-shell${showSplash ? '' : ' is-revealed'}`}
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-dark)' }}
    >
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      {/* Top Navigation Bar */}
      <header
        className="glass-panel"
        style={{
          height: '60px',
          margin: '1.25rem',
          borderRadius: '16px',
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
                fill="rgba(139, 92, 246, 0.15)"
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
              backgroundColor: 'rgba(167, 139, 250, 0.1)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              color: 'var(--color-accent-blue)',
              textTransform: 'uppercase',
            }}
          >
            Command Center v2.0
          </span>
        </div>

        {/* Video Source Control & Viewport Mode Switcher & Telemetry Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Weather Display */}
          <WeatherWidget />

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
                backgroundColor: activeMapTab === '2d' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
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
                backgroundColor: activeMapTab === '3d' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
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
          id="crowdshield-scroll-container"
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0 1.25rem 1.25rem 1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: 'minmax(940px, 1.2fr) minmax(380px, 1fr) minmax(560px, auto)',
          gap: '20px',
          overflowY: 'auto',
        }}
      >
        {/* UPPER ROW - PANEL 1: Primary Venue Viewport & Video Feed (Span 9) */}
        <div style={{ gridColumn: 'span 9', display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%', minHeight: 0 }}>
          {/* Top: Venue Map (2/3 of space) */}
          <section className="control-card scroll-reveal" style={{ flex: '1 1 auto', minHeight: '480px', display: 'flex', flexDirection: 'column' }}>
            <div className="control-card-header">
              <div className="control-card-title">
                <span className="dashboard-section-icon"><DashboardIcon name="map" /></span>
                <span className="gradient-text">{activeMapTab === '2d' ? 'Live Venue Overwatch & Density Map' : 'Digital Twin Environment'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <button
                  onClick={() => setActiveMapTab('2d')}
                  className="font-mono"
                  style={{
                    backgroundColor: activeMapTab === '2d' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                    border: `1px solid ${activeMapTab === '2d' ? 'var(--color-accent-blue)' : 'transparent'}`,
                    color: activeMapTab === '2d' ? 'var(--color-accent-blue)' : 'var(--color-text-muted)',
                    fontSize: '0.65rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  2D MAP
                </button>
                <button
                  onClick={() => setActiveMapTab('3d')}
                  className="font-mono"
                  style={{
                    backgroundColor: activeMapTab === '3d' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
                    border: `1px solid ${activeMapTab === '3d' ? 'var(--color-accent-blue)' : 'transparent'}`,
                    color: activeMapTab === '3d' ? 'var(--color-accent-blue)' : 'var(--color-text-muted)',
                    fontSize: '0.65rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  3D TWIN
                </button>
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

          {/* Bottom: Video Play Window (1/3 of space) */}
          <section className="control-card scroll-reveal scroll-reveal-delay-1" style={{ flex: '0 0 430px', minHeight: '430px' }}>
            <VideoSourceWidget />
          </section>
        </div>

        {/* UPPER ROW - PANEL 2: AI Interventions & Control Panel (Span 3) */}
        <section className="control-card scroll-reveal scroll-reveal-delay-1" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span className="dashboard-section-icon"><DashboardIcon name="ai" /></span>
              <span className="gradient-text">AI Interventions & Actions</span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-accent-blue)' }}>
              {activeAlerts.length} ALERTS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AIInterventionPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 3: Data Analytics & Predictive Trends (Span 3) */}
        <section className="control-card scroll-reveal" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span className="dashboard-section-icon"><DashboardIcon name="analytics" /></span>
              <span className="gradient-text">Density & Risk Time-Series Analytics</span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
              Recharts Engine
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '1.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AnalyticsPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 4: Resource Allocation (Span 3) */}
        <section className="control-card scroll-reveal scroll-reveal-delay-1" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span className="dashboard-section-icon"><DashboardIcon name="resources" /></span>
              <span className="gradient-text">Resource Deployments</span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
              {resourceAllocationSuggestions.length} SUGGESTIONS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '1.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ResourceAllocationPanel />
          </div>
        </section>

        {/* LOWER ROW - PANEL 5: Incident Reports (Span 3) */}
        <section className="control-card scroll-reveal scroll-reveal-delay-2" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span className="dashboard-section-icon"><DashboardIcon name="incident" /></span>
              <span className="gradient-text">Incident Reports</span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
              {incidentReports.length} REPORTS
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '1.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <IncidentReportsPanel onNavigateToZone={handleNavigateToZone} />
          </div>
        </section>

        {/* LOWER ROW - PANEL 6: Announcements (Span 3) */}
        <section className="control-card scroll-reveal scroll-reveal-delay-3" style={{ gridColumn: 'span 3', height: '100%', minHeight: 0 }}>
          <AnnouncementsPanel />
        </section>

        {/* SEPARATE ROW - EXTERNAL TRIGGERS & VOICE CONTROLS */}
        <section className="control-card scroll-reveal" style={{ gridColumn: '1 / -1', minHeight: '560px' }}>
          <div className="control-card-header">
            <div className="control-card-title">
              <span className="dashboard-section-icon"><DashboardIcon name="triggers" /></span>
              <span className="gradient-text">Triggers</span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--color-accent-cyan)' }}>
              STT / WEBHOOK
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '1.25rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ExternalTriggersPanel onNavigateToZone={handleNavigateToZone} />
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
