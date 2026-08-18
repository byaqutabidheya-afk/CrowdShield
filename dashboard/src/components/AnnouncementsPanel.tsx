import React, { useState } from 'react';
import { postAnnouncement } from '../api/client';
import type { AnnouncementResponse } from '../types/api';
import { AudioAnnouncementPlayer } from './AudioAnnouncementPlayer';

export const AnnouncementsPanel: React.FC = () => {
  const [baseMessage, setBaseMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnnouncementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBroadcast = async () => {
    if (!baseMessage.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await postAnnouncement({
        base_message_en: baseMessage,
        post_to_social: true,
      });
      setResult(response);
    } catch (err: any) {
      console.error('[AnnouncementsPanel] Broadcast failed:', err);
      setError(err.message || 'Failed to dispatch broadcast. Check network or server.');
    } finally {
      setLoading(false);
    }
  };

  const handlePredefined = (msg: string) => {
    setBaseMessage(msg);
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--border-panel)',
        borderRadius: '8px',
        padding: '1.15rem',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        boxShadow: 'var(--shadow-card)',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-bright)', letterSpacing: '0.05em' }} className="font-mono">
          📢 MULTILINGUAL PUBLIC ADDRESS
        </h3>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }} className="font-mono">
          5 LANGUAGES + SOCIAL
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          paddingRight: '0.35rem',
        }}
      >
        {/* Predefined Quick Action Chips */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            onClick={() => handlePredefined('Attention visitors: Please proceed calmly towards Gate B for exit.')}
            style={{
              fontSize: '0.65rem',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: 'var(--color-accent-blue)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            + Gate B Exit
          </button>
          <button
            onClick={() => handlePredefined('Safety Alert: High crowd density detected in Sector 3. Please slow down.')}
            style={{
              fontSize: '0.65rem',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: 'var(--color-accent-yellow)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            + High Density Alert
          </button>
          <button
            onClick={() => handlePredefined('Emergency: Evacuate Zone A1 immediately via designated emergency paths.')}
            style={{
              fontSize: '0.65rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            + Emergency Evacuation
          </button>
        </div>

        {/* Text Area Input */}
        <textarea
          value={baseMessage}
          onChange={(e) => setBaseMessage(e.target.value)}
          placeholder="Enter announcement message in English..."
          rows={2}
          style={{
            backgroundColor: '#090d16',
            border: '1px solid var(--border-panel)',
            color: 'var(--color-text-bright)',
            borderRadius: '6px',
            padding: '0.55rem',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
            resize: 'none',
            flexShrink: 0,
          }}
        />

        {/* Action Button */}
        <button
          onClick={handleBroadcast}
          disabled={loading || !baseMessage.trim()}
          style={{
            backgroundColor: loading ? 'rgba(30, 41, 59, 0.5)' : 'rgba(139, 92, 246, 0.15)',
            border: `1px solid ${loading ? 'rgba(148, 163, 184, 0.25)' : 'var(--color-accent-cyan)'}`,
            color: loading ? '#64748b' : 'var(--color-accent-cyan)',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.45rem 0.85rem',
            borderRadius: '4px',
            cursor: loading || !baseMessage.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease',
            flexShrink: 0,
            width: '100%',
          }}
        >
          {loading ? (
            <span className="font-mono">⏳ Dispatching Multilingual Broadcast...</span>
          ) : (
            <>
              <span>📢</span>
              <span>Broadcast Announcement</span>
            </>
          )}
        </button>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.7rem', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', flexShrink: 0 }}>
            ⚠️ {error}
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Audio Files */}
            {result.translations && Object.keys(result.translations).length > 0 && (
              <div style={{ backgroundColor: '#090d16', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '0.65rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-dim)', marginBottom: '0.45rem' }} className="font-mono">
                  GENERATED AUDIO TRANSCRIPTS (Scrollable):
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
                  {Object.entries(result.translations).map(([lang, detail]) => (
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

            {/* Social Dispatches */}
            {result.social_channels && Object.keys(result.social_channels).length > 0 && (
              <div style={{ backgroundColor: '#090d16', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '0.65rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-dim)', marginBottom: '0.45rem' }} className="font-mono">
                  SOCIAL DISPATCH PREVIEWS:
                </div>
                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    paddingRight: '0.25rem',
                  }}
                >
                  {Object.entries(result.social_channels).map(([platform, dispatch]: [string, any]) => (
                    <div key={platform} style={{ backgroundColor: '#0d1322', border: '1px solid var(--border-panel)', padding: '0.45rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent-cyan)', marginBottom: '0.2rem' }}>
                        {platform}
                      </div>
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {typeof dispatch === 'string' ? dispatch : dispatch?.formatted_text || dispatch?.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsPanel;
