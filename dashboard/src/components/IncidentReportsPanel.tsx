import React, { useEffect, useState, useMemo } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import { postIncidentSummary, postIncidentSummaryPreview } from '../api/client';
import type { IncidentReport } from '../types/api';

interface IncidentReportsPanelProps {
  onNavigateToZone?: (zoneId: string, gps_coordinates?: { latitude?: number; longitude?: number; [key: string]: any }) => void;
}

type SourceFilter = 'all' | 'citizen' | 'ai_generated';
type DisplayIncidentReport = IncidentReport & { is_mock?: boolean };

const MOCK_CITIZEN_REPORT: DisplayIncidentReport = {
  id: 'mock-citizen-demo-report',
  source: 'citizen',
  zone_id: 'zone_A1',
  notes: '[MOCK] Crowd is bunching near the main entry gate. Please check the queue and redirect arrivals if needed.',
  submitted_at: new Date().toISOString(),
  is_mock: true,
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
  const [summarizingIncidentId, setSummarizingIncidentId] = useState<string | null>(null);
  const [mockAiSummary, setMockAiSummary] = useState<Record<string, any> | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);

  // Initial fetch and 30-second polling
  // NOTE FOR PROD: Supabase Realtime subscription on the 'incident_reports' table (per Phase 4)
  // is a drop-in upgrade for instant WebSocket pushes when citizen reports arrive.
  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(() => {
      fetchIncidents();
    }, 30000); // 30s poll cycle

    return () => clearInterval(interval);
  }, [fetchIncidents]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchIncidents();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleGenerateSummary = async (report: DisplayIncidentReport) => {
    const incidentId = report.id;
    setSummarizingIncidentId(incidentId);
    setSummaryError(null);
    try {
      const updatedReport = report.is_mock
        ? await postIncidentSummaryPreview({ zone_id: report.zone_id || undefined, notes: report.notes })
        : await postIncidentSummary(incidentId);
      if (report.is_mock) {
        setMockAiSummary(updatedReport.ai_summary || null);
        return;
      }
      useLiveDataStore.setState((state) => ({
        incidentReports: state.incidentReports.map((report) =>
          report.id === updatedReport.id ? { ...report, ...updatedReport } : report
        ),
      }));
    } catch (error) {
      console.error('Failed to generate incident AI summary:', error);
      setSummaryError('AI summary failed. Check that the backend is running and try again.');
    } finally {
      setSummarizingIncidentId(null);
    }
  };

  // Filter and sort reports in reverse chronological order
  const filteredReports = useMemo(() => {
    const hasRealCitizenReport = incidentReports.some(
      (report) => report.source === 'citizen' && report.id !== MOCK_CITIZEN_REPORT.id
    );
    const reportsForDisplay: DisplayIncidentReport[] = hasRealCitizenReport
      ? incidentReports
      : [{ ...MOCK_CITIZEN_REPORT, ai_summary: mockAiSummary || undefined }, ...incidentReports];
    let list = [...reportsForDisplay];

    if (filter === 'citizen') {
      list = list.filter((r) => r.source === 'citizen');
    } else if (filter === 'ai_generated') {
      list = list.filter((r) => r.source === 'ai_generated');
    }

    return list.sort((a, b) => {
      const timeA = new Date(a.submitted_at || 0).getTime();
      const timeB = new Date(b.submitted_at || 0).getTime();
      return timeB - timeA;
    });
  }, [incidentReports, filter, mockAiSummary]);

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
            All ({incidentReports.length})
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
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
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
            const aiSummary = report.ai_summary;

            return (
              <div
                key={report.id}
                style={{
                  backgroundColor: 'rgba(13, 19, 34, 0.85)',
                  border: `1px solid ${isAI ? 'rgba(192, 132, 252, 0.3)' : 'rgba(56, 189, 248, 0.25)'}`,
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                }}
              >
                {/* Card Header: Source Badge, Zone, Relative Time */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {/* Source Badge */}
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: isAI ? 'rgba(192, 132, 252, 0.12)' : 'rgba(56, 189, 248, 0.12)',
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
                      <span className="font-mono" style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-accent-cyan)' }}>
                        [{report.zone_id}]
                      </span>
                    )}
                  </div>

                  {/* Relative Timestamp */}
                  <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                    {getRelativeTime(report.submitted_at)}
                  </span>
                </div>

                {/* Report Content / Notes */}
                <p style={{ fontSize: '0.75rem', color: '#f8fafc', lineHeight: '1.35' }}>
                  {report.notes}
                </p>

                {!isAI && !aiSummary && (
                  <button
                    type="button"
                    onClick={() => handleGenerateSummary(report)}
                    disabled={summarizingIncidentId === report.id}
                    style={{
                      alignSelf: 'flex-start',
                      border: '1px solid rgba(192, 132, 252, 0.45)',
                      borderRadius: '5px',
                      background: 'rgba(192, 132, 252, 0.1)',
                      color: '#d8b4fe',
                      padding: '0.35rem 0.55rem',
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      cursor: summarizingIncidentId === report.id ? 'wait' : 'pointer',
                    }}
                  >
                    {summarizingIncidentId === report.id ? 'Generating Summary...' : 'Generate AI Summary'}
                  </button>
                )}

                {/* Structured Mini-Report for AI-Generated Summaries */}
                {aiSummary && (
                  <div
                    style={{
                      backgroundColor: 'rgba(5, 8, 17, 0.7)',
                      border: '1px solid rgba(192, 132, 252, 0.25)',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                      marginTop: '0.1rem',
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c084fc' }} className="font-mono">
                      EXECUTIVE POST-INCIDENT SUMMARY
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem' }} className="font-mono">
                      {aiSummary.peak_risk_score !== undefined && (
                        <div>
                          <span style={{ color: 'var(--color-text-dim)' }}>Peak Risk: </span>
                          <span style={{ fontWeight: 700, color: '#ef4444' }}>
                            {(Number(aiSummary.peak_risk_score) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}

                      {(aiSummary.incident_duration_minutes || aiSummary.duration) && (
                        <div>
                          <span style={{ color: 'var(--color-text-dim)' }}>Duration: </span>
                          <span style={{ fontWeight: 700, color: 'var(--color-accent-blue)' }}>
                            {aiSummary.incident_duration_minutes || aiSummary.duration}m
                          </span>
                        </div>
                      )}
                    </div>

                    {aiSummary.narrative_summary && (
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: '1.3' }}>
                        {aiSummary.narrative_summary}
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
                      title="Click to view full image"
                    />
                  </div>
                )}

                {/* Map Link / Button */}
                {(report.gps_coordinates || report.zone_id) && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                    <button
                      onClick={() => onNavigateToZone?.(report.zone_id || '', report.gps_coordinates || undefined)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'var(--color-accent-cyan)',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: 0,
                      }}
                      className="font-mono"
                    >
                      <span>📍</span>
                      <span>View on map</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image Lightbox Modal */}
      {expandedPhotoUrl && (
        <div
          onClick={() => setExpandedPhotoUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={expandedPhotoUrl}
              alt="Expanded incident evidence"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', border: '1px solid var(--border-panel-bright)' }}
            />
            <button
              onClick={() => setExpandedPhotoUrl(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '1rem',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentReportsPanel;
