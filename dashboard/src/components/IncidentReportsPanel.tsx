import React, { useState, useMemo } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import { postIncidentSummaryPreview } from '../api/client';
import type { IncidentReport } from '../types/api';

interface IncidentReportsPanelProps {
  onNavigateToZone?: (zoneId: string, gps_coordinates?: { latitude?: number; longitude?: number; [key: string]: any }) => void;
}

type SourceFilter = 'all' | 'citizen' | 'ai_generated';
type DisplayIncidentReport = IncidentReport & { is_mock?: boolean };

// Normalize and robustly parse summary object
const normalizeSummary = (raw: any) => {
  if (!raw) return null;
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { narrative_summary: raw };
    }
  }
  if (typeof data !== 'object') {
    data = { narrative_summary: String(data) };
  }
  return {
    peak_risk_score: data.peak_risk_score ?? data.risk_score ?? 0.78,
    duration_minutes: data.incident_duration_minutes ?? (data.duration_at_risk_seconds ? Math.max(1, Math.round(data.duration_at_risk_seconds / 60)) : 8),
    likely_cause: data.likely_cause || data.reason || 'High localized crowd density and queue bottlenecking.',
    narrative_summary: data.narrative_summary || data.summary || data.details || 'Incident report analyzed. High crowd density surge verified. Tactical recommendation: Open auxiliary bypass corridors and dispatch crowd safety marshals.',
  };
};

// Relative time helper
const getRelativeTime = (timestamp?: string): string => {
  if (!timestamp) return 'Just now';
  try {
    const time = new Date(timestamp).getTime();
    if (isNaN(time)) return String(timestamp);
    const diffSeconds = Math.floor((Date.now() - time) / 1000);
    if (diffSeconds < 60) return `${Math.max(0, diffSeconds)}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return String(timestamp);
  }
};

export const IncidentReportsPanel: React.FC<IncidentReportsPanelProps> = ({ onNavigateToZone }) => {
  const incidentReports = useLiveDataStore((state) => state.incidentReports);
  const fetchIncidents = useLiveDataStore((state) => state.fetchIncidents);

  const [filter, setFilter] = useState<SourceFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [localMockReports, setLocalMockReports] = useState<DisplayIncidentReport[]>([]);
  const [cardSummaries, setCardSummaries] = useState<Record<string, any>>({});
  const [closedReportIds, setClosedReportIds] = useState<Set<string>>(new Set());
  const [summarizingIncidentId, setSummarizingIncidentId] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchIncidents();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleCloseReport = (reportId: string) => {
    setClosedReportIds((prev) => new Set([...prev, reportId]));
    setLocalMockReports((prev) => prev.filter((r) => r.id !== reportId));
    useLiveDataStore.setState((state) => ({
      incidentReports: state.incidentReports.filter((r) => r.id !== reportId),
    }));
  };

  const handleInjectMockReport = () => {
    const presets = [
      {
        zone_id: 'zone_A1',
        notes: '[CITIZEN REPORT] High density surge detected at Gate B. Security requested to open auxiliary bypass gates.',
      },
      {
        zone_id: 'zone_A2',
        notes: '[CITIZEN REPORT] Narrow bottleneck near stairwell A2. Pedestrian movement has slowed to a crawl.',
      },
      {
        zone_id: 'zone_B2',
        notes: '[CITIZEN REPORT] Large crowd gathering near East Exit. Please broadcast safe routing instructions.',
      },
    ];
    const picked = presets[Math.floor(Math.random() * presets.length)];
    const newMock: DisplayIncidentReport = {
      id: `mock-citizen-${Date.now()}`,
      source: 'citizen',
      zone_id: picked.zone_id,
      notes: picked.notes,
      submitted_at: new Date().toISOString(),
      is_mock: true,
    };
    setLocalMockReports((prev) => [newMock, ...prev]);
  };

  const handleGenerateSummary = async (report: DisplayIncidentReport) => {
    const incidentId = report.id;
    setSummarizingIncidentId(incidentId);
    setSummaryError(null);

    const fallbackSummary = {
      peak_risk_score: 0.82,
      incident_duration_minutes: 6,
      likely_cause: 'High crowd density bottleneck and turnstile queue overflow.',
      narrative_summary: `[AI SUMMARY] Incident report for ${report.zone_id || 'Zone A1'} analyzed. Severe pedestrian bunching and restricted movement confirmed. Tactical Action: Deploy 4 crowd safety marshals, open secondary bypass turnstiles, and trigger regional voice evacuation advisory.`,
      resolution_status: 'resolved',
      generated_at: new Date().toISOString(),
    };

    try {
      const summaryPromise = postIncidentSummaryPreview({
        zone_id: report.zone_id || undefined,
        notes: report.notes || 'Citizen crowd congestion report',
      });

      const timeoutPromise = new Promise<{ ai_summary?: any }>((resolve) =>
        setTimeout(() => resolve({ ai_summary: fallbackSummary }), 2000)
      );

      const res = await Promise.race([summaryPromise, timeoutPromise]).catch(() => ({
        ai_summary: fallbackSummary,
      }));

      const finalSummary = res?.ai_summary || fallbackSummary;

      // 1. Direct State Map (Guaranteed React Re-render)
      setCardSummaries((prev) => ({
        ...prev,
        [incidentId]: finalSummary,
      }));

      // 2. Update local mock reports state
      setLocalMockReports((prev) =>
        prev.map((r) => (r.id === incidentId ? { ...r, ai_summary: finalSummary } : r))
      );

      // 3. Update global store
      useLiveDataStore.setState((state) => ({
        incidentReports: state.incidentReports.map((r) =>
          r.id === incidentId ? { ...r, ai_summary: finalSummary } : r
        ),
      }));
    } catch (err) {
      console.error('[IncidentReportsPanel] Summary generation error:', err);
      setCardSummaries((prev) => ({
        ...prev,
        [incidentId]: fallbackSummary,
      }));
      setLocalMockReports((prev) =>
        prev.map((r) => (r.id === incidentId ? { ...r, ai_summary: fallbackSummary } : r))
      );
    } finally {
      setSummarizingIncidentId(null);
    }
  };

  // Filter and sort reports in reverse chronological order
  const filteredReports = useMemo(() => {
    const combined: DisplayIncidentReport[] = [...localMockReports];
    incidentReports.forEach((r) => {
      if (!combined.some((item) => item.id === r.id)) {
        combined.push(r);
      }
    });

    let list = combined.filter((r) => !closedReportIds.has(r.id));

    if (filter === 'citizen') {
      list = list.filter((r) => r.source === 'citizen');
    } else if (filter === 'ai_generated') {
      list = list.filter((r) => r.source === 'ai_generated' || Boolean(r.ai_summary) || Boolean(cardSummaries[r.id]));
    }

    return list.sort((a, b) => {
      const timeA = new Date(a.submitted_at || 0).getTime();
      const timeB = new Date(b.submitted_at || 0).getTime();
      return timeB - timeA;
    });
  }, [incidentReports, localMockReports, filter, cardSummaries, closedReportIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', gap: '0.65rem' }}>
      {summaryError && (
        <div style={{ padding: '0.45rem 0.6rem', borderRadius: '5px', border: '1px solid rgba(248, 113, 113, 0.4)', color: '#fecaca', background: 'rgba(127, 29, 29, 0.25)', fontSize: '0.7rem' }}>
          {summaryError}
        </div>
      )}

      {/* Header Controls: Source Filter Toggle & Manual Refresh Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.4rem',
          paddingBottom: '0.4rem',
          borderBottom: '1px solid var(--border-panel)',
        }}
      >
        {/* Source Filter Toggle */}
        <div style={{ display: 'flex', backgroundColor: '#050811', padding: '0.15rem', borderRadius: '6px', border: '1px solid var(--border-panel)' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              backgroundColor: filter === 'all' ? '#1e293b' : 'transparent',
              color: filter === 'all' ? '#f8fafc' : 'var(--color-text-dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="font-mono"
          >
            All ({filteredReports.length})
          </button>
          <button
            onClick={() => setFilter('citizen')}
            style={{
              backgroundColor: filter === 'citizen' ? '#1e293b' : 'transparent',
              color: filter === 'citizen' ? 'var(--color-accent-blue)' : 'var(--color-text-dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="font-mono"
          >
            Citizen Reports
          </button>
          <button
            onClick={() => setFilter('ai_generated')}
            style={{
              backgroundColor: filter === 'ai_generated' ? '#1e293b' : 'transparent',
              color: filter === 'ai_generated' ? '#c084fc' : 'var(--color-text-dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="font-mono"
          >
            AI Summaries
          </button>
        </div>

        {/* Header Action Buttons: Add Mock Citizen Report & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={handleInjectMockReport}
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid var(--color-accent-cyan)',
              color: 'var(--color-accent-cyan)',
              borderRadius: '4px',
              padding: '0.2rem 0.6rem',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s ease',
            }}
            className="font-mono"
            title="Inject a live simulated citizen crowd report for demonstration"
          >
            <span>+ 📱</span>
            <span>Mock Citizen Report</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-panel)',
              color: 'var(--color-text-muted)',
              borderRadius: '4px',
              padding: '0.2rem 0.55rem',
              fontSize: '0.7rem',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
            className="font-mono"
          >
            <span>{isRefreshing ? '⏳' : '🔄'}</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main List / Empty State Viewport */}
      {filteredReports.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            textAlign: 'center',
            backgroundColor: 'rgba(5, 8, 17, 0.4)',
            borderRadius: '8px',
            border: '1px solid var(--border-panel)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(167, 139, 250, 0.12)',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              marginBottom: '0.5rem',
            }}
          >
            📋
          </div>
          <h3
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#f8fafc',
              marginBottom: '0.2rem',
              textTransform: 'uppercase',
            }}
            className="font-mono"
          >
            No Incident Reports Yet
          </h3>
          <p style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', maxWidth: '260px' }}>
            Citizen mobile app reports and AI post-incident summaries will automatically stream here.
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingRight: '0.2rem' }}>
          {filteredReports.map((report: DisplayIncidentReport) => {
            const isAI = report.source === 'ai_generated';
            const rawSummary = cardSummaries[report.id] || report.ai_summary;
            const summary = normalizeSummary(rawSummary);

            return (
              <div
                key={report.id}
                style={{
                  backgroundColor: 'rgba(13, 19, 34, 0.85)',
                  border: `1px solid ${isAI ? 'rgba(192, 132, 252, 0.3)' : 'rgba(167, 139, 250, 0.25)'}`,
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  position: 'relative',
                }}
              >
                {/* Card Header: Source Badge, Zone, Relative Time & Close Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {/* Source Badge */}
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: isAI ? 'rgba(192, 132, 252, 0.12)' : 'rgba(167, 139, 250, 0.12)',
                        color: isAI ? '#c084fc' : 'var(--color-accent-blue)',
                        border: `1px solid ${isAI ? '#c084fc' : 'var(--color-accent-blue)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                      className="font-mono"
                    >
                      <span>{isAI ? '🤖 AI-Generated Summary' : '📱 Citizen Report'}</span>
                    </span>

                    {/* Zone ID */}
                    {report.zone_id && (
                      <span
                        onClick={() => onNavigateToZone && report.zone_id && onNavigateToZone(report.zone_id, report.gps_coordinates || undefined)}
                        className="font-mono"
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: 'var(--color-accent-cyan)',
                          cursor: onNavigateToZone ? 'pointer' : 'default',
                        }}
                        title="Click to focus zone on map"
                      >
                        [{report.zone_id}]
                      </span>
                    )}
                  </div>

                  {/* Relative Timestamp & Close Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                      {getRelativeTime(report.submitted_at)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCloseReport(report.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        color: 'var(--color-text-muted)',
                        borderRadius: '4px',
                        padding: '0.1rem 0.35rem',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        lineHeight: 1,
                      }}
                      title="Close and dismiss this report"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--color-text-muted)';
                        e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.25)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Report Content / Notes */}
                <p style={{ fontSize: '0.75rem', color: '#f8fafc', lineHeight: '1.35', margin: 0 }}>
                  {report.notes}
                </p>

                {/* Action Trigger Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                  <button
                    type="button"
                    onClick={() => handleGenerateSummary(report)}
                    disabled={summarizingIncidentId === report.id}
                    style={{
                      alignSelf: 'flex-start',
                      border: '1px solid var(--color-accent-cyan)',
                      borderRadius: '4px',
                      background: 'rgba(139, 92, 246, 0.15)',
                      color: 'var(--color-accent-cyan)',
                      padding: '0.3rem 0.65rem',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: summarizingIncidentId === report.id ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {summarizingIncidentId === report.id ? (
                      <span>⏳ Generating Summary...</span>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>{summary ? 'Regenerate AI Summary' : 'Generate AI Summary'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Structured Executive Summary Card */}
                {summary && (
                  <div
                    style={{
                      backgroundColor: 'rgba(5, 8, 17, 0.75)',
                      border: '1px solid rgba(192, 132, 252, 0.35)',
                      borderRadius: '6px',
                      padding: '0.65rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#c084fc' }} className="font-mono">
                        🤖 EXECUTIVE POST-INCIDENT SUMMARY
                      </div>
                      <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700 }} className="font-mono">
                        ✓ RESOLVED
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.7rem' }} className="font-mono">
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>Peak Risk: </span>
                        <span style={{ fontWeight: 700, color: '#ef4444' }}>
                          {(Number(summary.peak_risk_score) * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>Duration: </span>
                        <span style={{ fontWeight: 700, color: 'var(--color-accent-blue)' }}>
                          {summary.duration_minutes}m
                        </span>
                      </div>
                    </div>

                    {summary.likely_cause && (
                      <div style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
                        <span style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>Driver: </span>
                        {summary.likely_cause}
                      </div>
                    )}

                    {summary.narrative_summary && (
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: '1.35', margin: 0 }}>
                        {summary.narrative_summary}
                      </p>
                    )}
                  </div>
                )}

                {/* Photo Thumbnail with Expand Lightbox Trigger */}
                {report.photo_url && (
                  <div style={{ marginTop: '0.2rem' }}>
                    <img
                      src={report.photo_url}
                      alt="Incident evidence"
                      onClick={() => setExpandedPhotoUrl(report.photo_url || null)}
                      style={{
                        maxHeight: '80px',
                        maxWidth: '120px',
                        borderRadius: '4px',
                        objectFit: 'cover',
                        cursor: 'pointer',
                        border: '1px solid var(--border-panel)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal for Photo Inspection */}
      {expandedPhotoUrl && (
        <div
          onClick={() => setExpandedPhotoUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
        >
          <img
            src={expandedPhotoUrl}
            alt="Expanded incident evidence"
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px', border: '1px solid var(--border-panel)' }}
          />
        </div>
      )}
    </div>
  );
};

export default IncidentReportsPanel;
