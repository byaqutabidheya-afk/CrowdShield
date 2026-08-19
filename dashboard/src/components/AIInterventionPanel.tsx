import React, { useState, useEffect, useMemo } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import { postAnnouncement, postIntervention } from '../api/client';
import type { AlertData, AnnouncementResponse, InterventionRecord } from '../types/api';
import { AudioAnnouncementPlayer } from './AudioAnnouncementPlayer';

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

const getCategoryColor = (category: string = 'manual'): string => {
  switch (category.toLowerCase()) {
    case 'crowd_control':
      return '#38bdf8'; // Sky blue
    case 'evacuation':
      return '#f87171'; // Light red
    case 'security':
      return '#fbbf24'; // Amber
    case 'medical':
      return '#f43f5e'; // Rose
    case 'communication':
      return '#a78bfa'; // Violet
    case 'manual':
    default:
      return '#c084fc'; // Purple
  }
};

function formatActionTime(timestamp?: string): string {
  if (!timestamp) return 'Just now';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return timestamp;
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
}

export const AIInterventionPanel: React.FC = () => {
  const activeAlerts = useLiveDataStore((state) => state.activeAlerts);
  const dismissAlert = useLiveDataStore((state) => state.dismissAlert);
  const interventions = useLiveDataStore((state) => state.interventions);
  const fetchInterventions = useLiveDataStore((state) => state.fetchInterventions);
  const addIntervention = useLiveDataStore((state) => state.addIntervention);
  const dismissIntervention = useLiveDataStore((state) => state.dismissIntervention);

  // Tab: 'alerts' | 'log'
  const [activeTab, setActiveTab] = useState<'alerts' | 'log'>('alerts');

  // Filters for action log
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [isRefreshingLog, setIsRefreshingLog] = useState(false);

  // Standalone manual action creator state
  const [isCreatingAction, setIsCreatingAction] = useState(false);
  const [newActionZone, setNewActionZone] = useState('zone_A1');
  const [newActionCategory, setNewActionCategory] = useState('crowd_control');
  const [newActionText, setNewActionText] = useState('');
  const [isSubmittingNewAction, setIsSubmittingNewAction] = useState(false);
  const [newActionError, setNewActionError] = useState<string | null>(null);

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

  // Fetch logged interventions on initial mount
  useEffect(() => {
    fetchInterventions();
  }, [fetchInterventions]);

  const handleRefreshLog = async () => {
    setIsRefreshingLog(true);
    await fetchInterventions();
    setTimeout(() => setIsRefreshingLog(false), 350);
  };

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

  // Handler: Manual intervention logging from alert card
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

      addIntervention(record);

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

  // Handler: Standalone Manual Action Creator Submit
  const handleCreateStandaloneAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const actionText = newActionText.trim();
    if (!actionText) return;

    setIsSubmittingNewAction(true);
    setNewActionError(null);

    try {
      const record = await postIntervention({
        zone_id: newActionZone,
        action_taken: actionText,
        category: newActionCategory,
        triggered_by: 'operator',
      });

      addIntervention(record);
      setNewActionText('');
      setIsCreatingAction(false);
    } catch (err: any) {
      console.error('Failed to create manual intervention:', err);
      setNewActionError(err?.response?.data?.detail || err?.message || 'Failed to submit manual action.');
    } finally {
      setIsSubmittingNewAction(false);
    }
  };

  // Filtered interventions for the Action Log view
  const filteredInterventions = useMemo(() => {
    return interventions.filter((item) => {
      if (selectedZoneFilter !== 'all' && item.zone_id.toLowerCase() !== selectedZoneFilter.toLowerCase()) {
        return false;
      }
      if (selectedCategoryFilter !== 'all' && item.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesAction = item.action_taken.toLowerCase().includes(query);
        const matchesZone = item.zone_id.toLowerCase().includes(query);
        const matchesCat = item.category.toLowerCase().includes(query);
        if (!matchesAction && !matchesZone && !matchesCat) return false;
      }
      return true;
    });
  }, [interventions, selectedZoneFilter, selectedCategoryFilter, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '0.65rem' }}>
      {/* Top Tabs & Control Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
          flexWrap: 'wrap',
          paddingBottom: '0.4rem',
          borderBottom: '1px solid var(--border-panel)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'alerts' ? '1px solid var(--color-accent-cyan)' : '1px solid var(--border-panel)',
              backgroundColor: activeTab === 'alerts' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)',
              color: activeTab === 'alerts' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🚨</span>
            <span>Alerts</span>
            <span
              style={{
                backgroundColor: activeAlerts.length > 0 ? '#ef4444' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '0.62rem',
                padding: '0.05rem 0.35rem',
                borderRadius: '999px',
                fontWeight: 700,
              }}
            >
              {activeAlerts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('log')}
            className="font-mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'log' ? '1px solid #c084fc' : '1px solid var(--border-panel)',
              backgroundColor: activeTab === 'log' ? 'rgba(192, 132, 252, 0.15)' : 'rgba(15, 23, 42, 0.6)',
              color: activeTab === 'log' ? '#c084fc' : 'var(--color-text-dim)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📋</span>
            <span>Action Log</span>
            <span
              style={{
                backgroundColor: 'rgba(192, 132, 252, 0.25)',
                color: '#e2e8f0',
                fontSize: '0.62rem',
                padding: '0.05rem 0.35rem',
                borderRadius: '999px',
                fontWeight: 700,
              }}
            >
              {interventions.length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCreatingAction((prev) => !prev);
            if (activeTab !== 'log') setActiveTab('log');
          }}
          className="font-mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.28rem 0.55rem',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            backgroundColor: isCreatingAction ? 'rgba(56, 189, 248, 0.25)' : 'rgba(13, 19, 34, 0.8)',
            color: '#38bdf8',
          }}
        >
          <span>{isCreatingAction ? '✕ Close Form' : '➕ Log Action'}</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE ALERTS FEED */}
      {activeTab === 'alerts' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.25rem' }}>
          {activeAlerts.length === 0 ? (
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
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '280px', marginBottom: '1rem' }}>
                No active risk alerts requiring AI intervention at this time. Live computer vision overwatch is active.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('log')}
                className="font-mono"
                style={{
                  backgroundColor: 'rgba(192, 132, 252, 0.12)',
                  border: '1px solid rgba(192, 132, 252, 0.35)',
                  color: '#c084fc',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>📋</span>
                <span>Review Logged Actions ({interventions.length})</span>
              </button>
            </div>
          ) : (
            activeAlerts.map((alert: AlertData, alertIndex: number) => {
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
                      {/* Risk Level Badge */}
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          background: `linear-gradient(90deg, ${riskColor}33 0%, transparent 100%)`,
                          color: riskColor,
                          border: 'none',
                          borderLeft: `2px solid ${riskColor}`,
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
                            {/* Recommendation Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                                {rec.action || 'Safety Action Recommended'}
                              </span>

                              <div style={{ display: 'flex', gap: '0.35rem' }} className="font-mono">
                                <span
                                  style={{
                                    fontSize: '0.6rem',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '3px',
                                    border: '1px solid var(--color-accent-cyan)',
                                    color: 'var(--color-accent-cyan)',
                                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {rec.category || 'General'}
                                </span>

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

                            {/* Action Button: Broadcast Announcement */}
                            {isCommunication && (
                              <div style={{ marginTop: '0.35rem' }}>
                                <button
                                  onClick={() => handleBroadcast(recKey, zoneId, rec.action || rec.reasoning)}
                                  disabled={bState?.loading}
                                  style={{
                                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
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

                                    {bState.data.translations && Object.keys(bState.data.translations).length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }} className="font-mono">
                                          TTS AUDIO BROADCAST PREVIEWS:
                                        </div>
                                        <div
                                          style={{
                                            maxHeight: '220px',
                                            overflowY: 'auto',
                                            overflowX: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.45rem',
                                            paddingRight: '0.25rem',
                                          }}
                                        >
                                          {Object.entries(bState.data.translations).map(([lang, detail]: [string, any]) => (
                                            <AudioAnnouncementPlayer
                                              key={lang}
                                              languageCode={lang}
                                              text={detail.text}
                                              audioUrl={detail.audio_path}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: '#10b981' }} className="font-mono">
                          <span>✓ Action logged (ID: {logState.successRecord.id || 'saved'})</span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('log')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#38bdf8',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              fontSize: '0.68rem',
                            }}
                          >
                            View in Log →
                          </button>
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
            })
          )}
        </div>
      )}

      {/* TAB 2: LOGGED MANUAL ACTIONS AUDIT REVIEW */}
      {activeTab === 'log' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/* Creator Form (Expandable) */}
          {isCreatingAction && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '8px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                  ➕ Log New Action / Intervention
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingAction(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateStandaloneAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                      Target Zone
                    </label>
                    <select
                      value={newActionZone}
                      onChange={(e) => setNewActionZone(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#050811',
                        border: '1px solid var(--border-panel)',
                        borderRadius: '4px',
                        color: '#f8fafc',
                        padding: '0.35rem 0.5rem',
                        fontSize: '0.75rem',
                      }}
                    >
                      <option value="zone_A1">Zone A1 (Main Entry)</option>
                      <option value="zone_A2">Zone A2 (Corridor / Concourse)</option>
                      <option value="zone_B1">Zone B1 (Stage / Platform)</option>
                      <option value="zone_B2">Zone B2 (East Exit Gates)</option>
                      <option value="global">Global / Venue-Wide</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                      Category
                    </label>
                    <select
                      value={newActionCategory}
                      onChange={(e) => setNewActionCategory(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#050811',
                        border: '1px solid var(--border-panel)',
                        borderRadius: '4px',
                        color: '#f8fafc',
                        padding: '0.35rem 0.5rem',
                        fontSize: '0.75rem',
                      }}
                    >
                      <option value="crowd_control">Crowd Control</option>
                      <option value="manual">Manual / Operator</option>
                      <option value="evacuation">Evacuation / Rerouting</option>
                      <option value="security">Security Dispatch</option>
                      <option value="medical">Medical First Aid</option>
                      <option value="communication">PA Broadcast</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>
                    Action Taken & Observations
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe action taken (e.g. Deployed 4 stewards to regulate gate queues)..."
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#050811',
                      border: '1px solid var(--border-panel)',
                      borderRadius: '4px',
                      color: '#f8fafc',
                      padding: '0.4rem 0.5rem',
                      fontSize: '0.75rem',
                      resize: 'none',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Quick Preset Buttons */}
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }}>
                    QUICK PRESETS:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {[
                      'Deploy 4 crowd marshals',
                      'Open auxiliary bypass gate',
                      'Reposition metal barricades',
                      'Dispatch first-aid responder',
                      'Issue calm queuing guidance',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewActionText(preset)}
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#cbd5e1',
                          padding: '0.2rem 0.45rem',
                          borderRadius: '3px',
                          fontSize: '0.62rem',
                          cursor: 'pointer',
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {newActionError && (
                  <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>
                    ⚠️ {newActionError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsCreatingAction(false)}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border-panel)',
                      color: 'var(--color-text-dim)',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNewAction || !newActionText.trim()}
                    style={{
                      backgroundColor: 'var(--color-accent-blue)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: isSubmittingNewAction || !newActionText.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSubmittingNewAction ? 'Submitting...' : 'Save Intervention'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Action Log Filters & Search Bar */}
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              backgroundColor: 'rgba(5, 8, 17, 0.6)',
              padding: '0.45rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid var(--border-panel)',
            }}
          >
            <input
              type="text"
              placeholder="Search actions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: '110px',
                backgroundColor: '#0d1322',
                border: '1px solid var(--border-panel)',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.72rem',
                color: '#f8fafc',
                outline: 'none',
              }}
            />

            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              style={{
                backgroundColor: '#0d1322',
                border: '1px solid var(--border-panel)',
                borderRadius: '4px',
                color: '#f8fafc',
                padding: '0.25rem 0.4rem',
                fontSize: '0.7rem',
              }}
            >
              <option value="all">All Zones</option>
              <option value="zone_A1">Zone A1</option>
              <option value="zone_A2">Zone A2</option>
              <option value="zone_B1">Zone B1</option>
              <option value="zone_B2">Zone B2</option>
              <option value="global">Global</option>
            </select>

            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              style={{
                backgroundColor: '#0d1322',
                border: '1px solid var(--border-panel)',
                borderRadius: '4px',
                color: '#f8fafc',
                padding: '0.25rem 0.4rem',
                fontSize: '0.7rem',
              }}
            >
              <option value="all">All Categories</option>
              <option value="manual">Manual</option>
              <option value="crowd_control">Crowd Control</option>
              <option value="evacuation">Evacuation</option>
              <option value="security">Security</option>
              <option value="medical">Medical</option>
            </select>

            <button
              type="button"
              onClick={handleRefreshLog}
              disabled={isRefreshingLog}
              title="Refresh Actions Log"
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-panel-bright)',
                color: '#cbd5e1',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isRefreshingLog ? '↻...' : '↻'}
            </button>
          </div>

          {/* Action Log List */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              paddingRight: '0.25rem',
            }}
          >
            {filteredInterventions.length === 0 ? (
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
                <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>📋</div>
                <h4 style={{ fontSize: '0.85rem', color: '#e2e8f0', marginBottom: '0.25rem' }}>
                  No Logged Actions Found
                </h4>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', maxWidth: '240px', marginBottom: '0.75rem' }}>
                  {interventions.length === 0
                    ? 'No manual actions or tactical interventions recorded yet.'
                    : 'No actions match the current filter or search criteria.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingAction(true)}
                  className="font-mono"
                  style={{
                    backgroundColor: 'var(--color-accent-blue)',
                    border: 'none',
                    color: '#fff',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ➕ Log Manual Action
                </button>
              </div>
            ) : (
              filteredInterventions.map((action, idx) => {
                const catColor = getCategoryColor(action.category);

                return (
                  <div
                    key={action.id || `action_${idx}`}
                    style={{
                      backgroundColor: 'rgba(13, 19, 34, 0.9)',
                      border: '1px solid var(--border-panel)',
                      borderLeft: `3px solid ${catColor}`,
                      borderRadius: '6px',
                      padding: '0.65rem 0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#f8fafc',
                            backgroundColor: '#1e293b',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '3px',
                          }}
                        >
                          {action.zone_id || 'Global'}
                        </span>

                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '3px',
                            backgroundColor: `${catColor}22`,
                            color: catColor,
                            border: `1px solid ${catColor}55`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {action.category || 'Manual'}
                        </span>

                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.58rem',
                            padding: '0.08rem 0.3rem',
                            borderRadius: '2px',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            color: 'var(--color-text-dim)',
                            textTransform: 'uppercase',
                          }}
                        >
                          By: {action.triggered_by || 'operator'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                          {formatActionTime(action.timestamp)}
                        </span>

                        <button
                          type="button"
                          onClick={() => dismissIntervention(action.id)}
                          title="Close / Dismiss this log"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            padding: '0.1rem 0.25rem',
                            lineHeight: 1,
                            borderRadius: '3px',
                            transition: 'color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Action Content Text */}
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                      {action.action_taken}
                    </p>

                    {/* Footer / ID */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                      <span className="font-mono" style={{ fontSize: '0.58rem', color: '#64748b' }}>
                        ID: {action.id || 'saved'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInterventionPanel;
