import React, { useState } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import { postAnnouncement, postIntervention } from '../api/client';
import type { AlertData, AnnouncementResponse, InterventionRecord } from '../types/api';

// Risk Level Badge Colors (as mandated by dashboard spec)
const getRiskBadgeColor = (riskLevel: string = 'low'): string => {
  switch (riskLevel.toLowerCase()) {
    case 'critical':
      return '#ef4444'; // critical red
    case 'high':
      return '#f97316'; // high orange
    case 'moderate':
      return '#eab308'; // moderate yellow
    case 'low':
    default:
      return '#22c55e'; // low green
  }
};

// Helper to construct full playable audio URL
const getAudioUrl = (audioPath?: string | null): string | null => {
  if (!audioPath) return null;
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    return audioPath;
  }
  const backendBase = (import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
  return `${backendBase}/${audioPath.replace(/^\//, '')}`;
};

export const AIInterventionPanel: React.FC = () => {
  const activeAlerts = useLiveDataStore((state) => state.activeAlerts);
  const dismissAlert = useLiveDataStore((state) => state.dismissAlert);

  // Per-recommendation announcement broadcast state: recKey -> { loading, data, error }
  const [broadcastState, setBroadcastState] = useState<
    Record<string, { loading: boolean; data?: AnnouncementResponse; error?: string }>
  >({});

  // Per-card manual intervention input state: zoneId -> text
  const [manualInputState, setManualInputState] = useState<Record<string, string>>({});

  // Per-card manual intervention submission state: zoneId -> { loading, successRecord, error }
  const [manualLogState, setManualLogState] = useState<
    Record<string, { loading: boolean; successRecord?: InterventionRecord; error?: string }>
  >({});

  // Handler: Broadcast announcement via POST /api/announcements
  const handleBroadcast = async (recKey: string, zoneId: string, actionText: string) => {
    setBroadcastState((prev) => ({
      ...prev,
      [recKey]: { loading: true },
    }));

    try {
      const response = await postAnnouncement({
        base_message_en: actionText,
        zone_id: zoneId,
        post_to_social: true,
      });

      setBroadcastState((prev) => ({
        ...prev,
        [recKey]: { loading: false, data: response },
      }));
    } catch (err: any) {
      console.error(`[AIInterventionPanel] Announcement broadcast error:`, err);
      setBroadcastState((prev) => ({
        ...prev,
        [recKey]: {
          loading: false,
          error: err?.response?.data?.detail || err?.message || 'Failed to dispatch broadcast announcement.',
        },
      }));
    }
  };

  // Handler: Manual intervention logging via POST /api/interventions
  const handleLogIntervention = async (zoneId: string) => {
    const actionText = (manualInputState[zoneId] || '').trim();
    if (!actionText) return;

    setManualLogState((prev) => ({
      ...prev,
      [zoneId]: { loading: true },
    }));

    try {
      const record = await postIntervention({
        zone_id: zoneId,
        action_taken: actionText,
        category: 'manual',
        triggered_by: 'operator',
      });

      setManualLogState((prev) => ({
        ...prev,
        [zoneId]: { loading: false, successRecord: record },
      }));

      // Reset text input for this zone
      setManualInputState((prev) => ({ ...prev, [zoneId]: '' }));
    } catch (err: any) {
      console.error(`[AIInterventionPanel] Manual intervention log error:`, err);
      setManualLogState((prev) => ({
        ...prev,
        [zoneId]: {
          loading: false,
          error: err?.response?.data?.detail || err?.message || 'Failed to log manual intervention.',
        },
      }));
    }
  };

  // 1. Nominal / Empty State
  if (!activeAlerts || activeAlerts.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: 'rgba(5, 8, 17, 0.4)',
          borderRadius: '8px',
          border: '1px solid var(--border-panel)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '0.75rem',
          }}
        >
          🛡️
        </div>
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: '#10b981',
            marginBottom: '0.25rem',
            textTransform: 'uppercase',
          }}
          className="font-mono"
        >
          All Zones Nominal
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '280px' }}>
          No active risk alerts requiring AI intervention at this time. Live computer vision overwatch is active.
        </p>
      </div>
    );
  }

  // 2. Active Alert Cards Feed
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '0.25rem' }}>
      {activeAlerts.map((alert: AlertData, alertIndex: number) => {
        const zoneId = alert.zone_id || 'Global';
        const riskLevel = alert.risk_level || 'high';
        const riskColor = getRiskBadgeColor(riskLevel);
        const recommendations = alert.recommendations || [];
        const logState = manualLogState[zoneId];

        return (
          <div
            key={alert.id || `${zoneId}_${alertIndex}`}
            style={{
              backgroundColor: 'rgba(13, 19, 34, 0.9)',
              border: `1px solid ${riskColor}55`,
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: `0 2px 12px ${riskColor}15`,
            }}
          >
            {/* Alert Header */}
            <div
              style={{
                backgroundColor: '#131b2e',
                padding: '0.6rem 0.85rem',
                borderBottom: '1px solid var(--border-panel)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem' }}>🚨</span>
                <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                  Zone: {zoneId}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Risk Level Badge (Strict risk color palette) */}
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: `${riskColor}22`,
                    color: riskColor,
                    border: `1px solid ${riskColor}`,
                    textTransform: 'uppercase',
                  }}
                >
                  {riskLevel} Risk
                </span>

                {/* Dismiss Button */}
                <button
                  onClick={() => dismissAlert(alert.id || zoneId)}
                  title="Dismiss Alert"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-dim)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '0.1rem 0.3rem',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Alert Body & AI Recommendations */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.85rem' }}>
              {recommendations.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  Analyzing optimal mitigation vectors for {zoneId}...
                </p>
              ) : (
                recommendations.map((rec: any, recIdx: number) => {
                  const recKey = `${zoneId}_rec_${recIdx}`;
                  const isCommunication =
                    (rec.category || '').toLowerCase() === 'communication' ||
                    (rec.action || '').toLowerCase().includes('announc') ||
                    (rec.action || '').toLowerCase().includes('broadcast');

                  const bState = broadcastState[recKey];

                  return (
                    <div
                      key={recKey}
                      style={{
                        backgroundColor: 'rgba(5, 8, 17, 0.7)',
                        border: '1px solid var(--border-panel)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      {/* Recommendation Header with Distinct Category & Urgency Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                          {rec.action || 'Safety Action Recommended'}
                        </span>

                        <div style={{ display: 'flex', gap: '0.35rem' }} className="font-mono">
                          {/* Category Badge - Visually distinct cyan outline */}
                          <span
                            style={{
                              fontSize: '0.6rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '3px',
                              border: '1px solid var(--color-accent-cyan)',
                              color: 'var(--color-accent-cyan)',
                              backgroundColor: 'rgba(6, 182, 212, 0.1)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {rec.category || 'General'}
                          </span>

                          {/* Urgency Badge - Visually distinct purple outline */}
                          <span
                            style={{
                              fontSize: '0.6rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '3px',
                              border: '1px solid #8b5cf6',
                              color: '#c084fc',
                              backgroundColor: 'rgba(139, 92, 246, 0.1)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {rec.urgency || 'Immediate'}
                          </span>
                        </div>
                      </div>

                      {/* Reasoning Text */}
                      {rec.reasoning && (
                        <p style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', lineHeight: '1.3' }}>
                          <strong style={{ color: 'var(--color-text-main)' }}>Reasoning:</strong> {rec.reasoning}
                        </p>
                      )}

                      {/* Action Button: Broadcast Announcement (For Communication category) */}
                      {isCommunication && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <button
                            onClick={() => handleBroadcast(recKey, zoneId, rec.action || rec.reasoning)}
                            disabled={bState?.loading}
                            style={{
                              backgroundColor: 'rgba(6, 182, 212, 0.15)',
                              border: '1px solid var(--color-accent-cyan)',
                              color: 'var(--color-accent-cyan)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.4rem 0.75rem',
                              borderRadius: '4px',
                              cursor: bState?.loading ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              width: '100%',
                              justifyContent: 'center',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {bState?.loading ? (
                              <>
                                <span className="font-mono">⏳ Dispatching Multilingual Broadcast...</span>
                              </>
                            ) : (
                              <>
                                <span>📢</span>
                                <span>Broadcast This Announcement</span>
                              </>
                            )}
                          </button>

                          {/* Broadcast Result: TTS Audio Players & Social Channel Previews */}
                          {bState?.data && (
                            <div
                              style={{
                                marginTop: '0.6rem',
                                padding: '0.6rem',
                                backgroundColor: '#090d16',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                borderRadius: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                              }}
                            >
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }} className="font-mono">
                                ✓ Announcement Dispatched to Audio PA & Social Hub
                              </div>

                              {/* TTS Audio Player per Language */}
                              {bState.data.translations && Object.keys(bState.data.translations).length > 0 && (
                                <div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }} className="font-mono">
                                    TTS AUDIO BROADCAST PREVIEWS:
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {Object.entries(bState.data.translations).map(([lang, detail]) => {
                                      const playableUrl = getAudioUrl(detail.audio_path);
                                      return (
                                        <div key={lang} style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                          <span style={{ color: 'var(--color-accent-blue)', fontWeight: 600 }} className="font-mono">
                                            [{lang.toUpperCase()}] "{detail.text}"
                                          </span>
                                          {playableUrl ? (
                                            <audio controls src={playableUrl} style={{ height: '28px', width: '100%' }} />
                                          ) : (
                                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                                              (Audio file synthesized)
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Social Channels Preview Cards */}
                              {bState.data.social_channels && Object.keys(bState.data.social_channels).length > 0 && (
                                <div style={{ marginTop: '0.35rem' }}>
                                  <div
                                    style={{
                                      fontSize: '0.65rem',
                                      color: 'var(--color-text-dim)',
                                      marginBottom: '0.25rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                    }}
                                    className="font-mono"
                                  >
                                    <span>MULTI-CHANNEL SOCIAL DISPATCHES:</span>
                                    <span style={{ color: 'var(--color-status-connecting)', fontSize: '0.6rem' }}>
                                      (Simulated — no live social account connected)
                                    </span>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.4rem' }}>
                                    {Object.entries(bState.data.social_channels).map(([platform, dispatch]: [string, any]) => (
                                      <div
                                        key={platform}
                                        style={{
                                          backgroundColor: '#0d1322',
                                          border: '1px solid var(--border-panel)',
                                          borderRadius: '4px',
                                          padding: '0.4rem',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '0.25rem',
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent-blue)' }} className="font-mono">
                                            {platform}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: '0.55rem',
                                              padding: '0.05rem 0.25rem',
                                              borderRadius: '2px',
                                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                              color: 'var(--color-status-connecting)',
                                              border: '1px solid rgba(245, 158, 11, 0.3)',
                                            }}
                                            className="font-mono"
                                          >
                                            Simulated Post
                                          </span>
                                        </div>
                                        <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', lineHeight: '1.2' }}>
                                          {typeof dispatch === 'string'
                                            ? dispatch
                                            : dispatch?.formatted_text || dispatch?.text || bState.data?.base_message_en}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Broadcast Error */}
                          {bState?.error && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#ef4444' }}>
                              ⚠️ {bState.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Manual "Log Intervention" Quick-Action Section */}
              <div
                style={{
                  marginTop: '0.25rem',
                  paddingTop: '0.6rem',
                  borderTop: '1px dashed var(--border-panel)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }} className="font-mono">
                  Quick Action // Log Manual Intervention:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder={`e.g. Dispatched 5 guards to ${zoneId}...`}
                    value={manualInputState[zoneId] || ''}
                    onChange={(e) =>
                      setManualInputState((prev) => ({
                        ...prev,
                        [zoneId]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLogIntervention(zoneId);
                    }}
                    disabled={logState?.loading}
                    style={{
                      flex: 1,
                      backgroundColor: '#050811',
                      border: '1px solid var(--border-panel)',
                      borderRadius: '4px',
                      padding: '0.35rem 0.6rem',
                      fontSize: '0.75rem',
                      color: '#f8fafc',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleLogIntervention(zoneId)}
                    disabled={logState?.loading || !(manualInputState[zoneId] || '').trim()}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid var(--border-panel-bright)',
                      color: '#f8fafc',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.35rem 0.65rem',
                      borderRadius: '4px',
                      cursor: logState?.loading ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {logState?.loading ? 'Logging...' : 'Log Action'}
                  </button>
                </div>

                {/* Manual Log Feedback */}
                {logState?.successRecord && (
                  <div style={{ fontSize: '0.68rem', color: '#10b981' }} className="font-mono">
                    ✓ Intervention logged to audit trail (ID: {logState.successRecord.id || 'record_saved'})
                  </div>
                )}
                {logState?.error && (
                  <div style={{ fontSize: '0.68rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⚠️ {logState.error}</span>
                    <button
                      onClick={() => handleLogIntervention(zoneId)}
                      style={{ background: 'none', border: 'underline', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem' }}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AIInterventionPanel;
