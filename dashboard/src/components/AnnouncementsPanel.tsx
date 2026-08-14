import React, { useState } from 'react';
import { postAnnouncement } from '../api/client';
import type { AnnouncementResponse } from '../types/api';

const getAudioUrl = (audioPath?: string | null): string | null => {
  if (!audioPath) return null;
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    return audioPath;
  }
  const backendBase = (import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
  const cleanPath = audioPath.replace(/\\/g, '/').replace(/^\//, '');
  return `${backendBase}/${cleanPath}`;
};

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
      console.error('Failed to broadcast announcement', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to dispatch broadcast.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div className="control-card-header">
        <div className="control-card-title">
          <span style={{ color: 'var(--color-accent-cyan)' }}>📢</span>
          Multilingual Announcements
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: '0.85rem', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Create and broadcast safety announcements in multiple languages across all venue zones.
        </p>

        <textarea
          value={baseMessage}
          onChange={(e) => setBaseMessage(e.target.value)}
          placeholder="Enter safety message in English (e.g., Please remain calm and proceed to Exit B...)"
          style={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            display: 'block',
            height: '80px',
            backgroundColor: '#050811',
            border: '1px solid var(--border-panel)',
            borderRadius: '6px',
            padding: '0.6rem',
            color: '#f8fafc',
            fontSize: '0.75rem',
            resize: 'none',
            outline: 'none',
          }}
        />

        <button
          onClick={handleBroadcast}
          disabled={loading || !baseMessage.trim()}
          style={{
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid var(--color-accent-cyan)',
            color: 'var(--color-accent-cyan)',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.6rem',
            borderRadius: '6px',
            cursor: loading || !baseMessage.trim() ? 'not-allowed' : 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
          }}
        >
          {loading ? '⏳ Generating Audio & Dispatching...' : '📢 Broadcast Announcement'}
        </button>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.7rem', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
            ⚠️ {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Audio Files */}
            {result.translations && Object.keys(result.translations).length > 0 && (
              <div style={{ backgroundColor: '#090d16', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '0.65rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }} className="font-mono">
                  GENERATED TTS AUDIO (Click to Play):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {Object.entries(result.translations).map(([lang, detail]) => {
                    const playableUrl = getAudioUrl(detail.audio_path);
                    return (
                      <div key={lang} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-accent-blue)', fontWeight: 600 }}>
                          [{lang.toUpperCase()}] {detail.text}
                        </div>
                        {playableUrl ? (
                          <audio controls src={playableUrl} style={{ height: '30px', width: '100%' }} />
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Audio unavailable</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Social Dispatches */}
            {result.social_channels && Object.keys(result.social_channels).length > 0 && (
              <div style={{ backgroundColor: '#090d16', border: '1px solid var(--border-panel)', borderRadius: '6px', padding: '0.65rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginBottom: '0.5rem' }} className="font-mono">
                  SOCIAL DISPATCH PREVIEWS:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Object.entries(result.social_channels).map(([platform, dispatch]: [string, any]) => (
                    <div key={platform} style={{ backgroundColor: '#0d1322', border: '1px solid var(--border-panel)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent-cyan)', marginBottom: '0.25rem' }}>
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
