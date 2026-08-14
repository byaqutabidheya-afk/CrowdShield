import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getZones, postSignageWebhook, getSentiment, postVoiceCommand, postAnnouncement } from '../api/client';
import type {
  ZoneConfig,
  SignageWebhookResponse,
  SentimentAnalysisResponse,
  VoiceCommandResponse,
} from '../types/api';

interface ExternalTriggersPanelProps {
  onNavigateToZone?: (zoneId: string) => void;
}

const getAudioUrl = (audioPath?: string | null): string | null => {
  if (!audioPath) return null;
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    return audioPath;
  }
  const backendBase = (import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
  return `${backendBase}/${audioPath.replace(/^\//, '')}`;
};

export const ExternalTriggersPanel: React.FC<ExternalTriggersPanelProps> = ({ onNavigateToZone }) => {
  // Zone list for signage dropdown
  const [zones, setZones] = useState<ZoneConfig[]>([]);
  const [selectedSignageZone, setSelectedSignageZone] = useState<string>('zone_A1');
  const [signageMessage, setSignageMessage] = useState<string>('EMERGENCY EXITS OPEN — PROCEED TO ZONE B SAFELY');
  const [isSignageLoading, setIsSignageLoading] = useState<boolean>(false);
  const [signageResponse, setSignageResponse] = useState<SignageWebhookResponse | null>(null);
  const [signageError, setSignageError] = useState<string | null>(null);

  // Announcements state
  const [announcementMessage, setAnnouncementMessage] = useState<string>('Please remain calm and follow staff instructions.');
  const [isAnnouncementLoading, setIsAnnouncementLoading] = useState<boolean>(false);
  const [announcementResponse, setAnnouncementResponse] = useState<any>(null);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);

  // Sentiment Monitor state
  const [sentimentData, setSentimentData] = useState<SentimentAnalysisResponse | null>(null);
  const [isSentimentLoading, setIsSentimentLoading] = useState<boolean>(false);
  const [sentimentError, setSentimentError] = useState<string | null>(null);

  // Voice Assistant state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState<boolean>(false);
  const [voiceResult, setVoiceResult] = useState<VoiceCommandResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Load Zones on Mount
  useEffect(() => {
    const fetchZoneList = async () => {
      try {
        const data = await getZones();
        if (data && data.length > 0) {
          setZones(data);
          setSelectedSignageZone(data[0].zone_id);
        }
      } catch (err) {
        console.error('[ExternalTriggersPanel] Failed to fetch zone list:', err);
      }
    };
    fetchZoneList();
  }, []);

  // 2. Poll GET /api/sentiment every 60 seconds
  const fetchSentiment = useCallback(async () => {
    try {
      setIsSentimentLoading(true);
      const data = await getSentiment();
      setSentimentData(data);
      setSentimentError(null);
    } catch (err: any) {
      console.error('[ExternalTriggersPanel] Sentiment analysis error:', err);
      setSentimentError(err?.message || 'Failed to fetch social sentiment analysis.');
    } finally {
      setIsSentimentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 60000); // 60s polling
    return () => clearInterval(interval);
  }, [fetchSentiment]);

  // 3. Digital Signage Webhook Handler
  const handleSignagePush = async () => {
    if (!signageMessage.trim()) return;

    setIsSignageLoading(true);
    setSignageError(null);

    try {
      // 1. Translate the message using the existing announcement endpoint
      const annRes = await postAnnouncement({
        base_message_en: signageMessage.trim(),
        target_languages: ['hi', 'ta', 'te', 'bn', 'mr'],
        zone_id: selectedSignageZone,
        post_to_social: false,
      });

      // 2. Format the translated string
      let translatedMsg = signageMessage.trim();
      if (annRes && annRes.translations) {
        const parts = [`[EN] ${translatedMsg}`];
        for (const [lang, detail] of Object.entries(annRes.translations)) {
          parts.push(`[${lang.toUpperCase()}] ${detail.text}`);
        }
        translatedMsg = parts.join(' | ');
      }

      // 3. Push to signage
      const res = await postSignageWebhook({
        zone_id: selectedSignageZone,
        message: translatedMsg,
        direction_arrows: ['N', 'NE'],
      });
      setSignageResponse(res);
    } catch (err: any) {
      console.error('[ExternalTriggersPanel] Signage webhook error:', err);
      setSignageError(err?.response?.data?.detail || err?.message || 'Failed to dispatch signage webhook.');
    } finally {
      setIsSignageLoading(false);
    }
  };

  // 4. Multilingual Public Address (PA) Handler
  const handleAnnouncementPush = async () => {
    if (!announcementMessage.trim()) return;

    setIsAnnouncementLoading(true);
    setAnnouncementError(null);

    try {
      const res = await postAnnouncement({
        base_message_en: announcementMessage.trim(),
        target_languages: ['hi', 'ta', 'te', 'bn', 'mr'],
        zone_id: selectedSignageZone,
        post_to_social: true,
      });
      setAnnouncementResponse(res);
    } catch (err: any) {
      console.error('[ExternalTriggersPanel] Announcement push error:', err);
      setAnnouncementError(err?.response?.data?.detail || err?.message || 'Failed to dispatch announcement.');
    } finally {
      setIsAnnouncementLoading(false);
    }
  };

  // 5. Voice Assistant Recording Logic
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);
  }, []);

  const startRecording = async () => {
    setVoiceError(null);
    setVoiceResult(null);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('Browser microphone access not supported in this environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setIsVoiceProcessing(true);

        try {
          const result = await postVoiceCommand(audioBlob);
          setVoiceResult(result);

          // If matched intent is navigate_to_zone, invoke callback
          if (
            result.matched_intent === 'navigate_to_zone' ||
            result.intent_params?.zone_id
          ) {
            const targetZone = result.intent_params?.zone_id || 'zone_A1';
            onNavigateToZone?.(targetZone);
          }
        } catch (err: any) {
          console.error('[ExternalTriggersPanel] Voice command upload error:', err);
          setVoiceError(err?.response?.data?.detail || err?.message || 'Failed to process voice command.');
        } finally {
          setIsVoiceProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start 1s timer for recording display
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Auto-stop after 5 seconds
      autoStopTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 5000);
    } catch (err: any) {
      console.error('[ExternalTriggersPanel] Microphone permission error:', err);
      setVoiceError('Microphone access denied or unavailable. Grant permission to speak.');
    }
  };

  const handleVoiceButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Helper for unrest score gauge color
  const unrestScore = sentimentData?.aggregated_unrest_score ?? 0.0;
  const unrestColor = unrestScore > 0.6 ? '#ef4444' : unrestScore > 0.3 ? '#f97316' : '#10b981';

  return (
    <div className="external-triggers-grid" style={{ flex: 1, minHeight: 0, width: '100%' }}>
      {/* SECTION 1: Voice Control & Assistant Trigger */}
      <div className="trigger-subcontainer"
        style={{
          backgroundColor: 'rgba(5, 8, 17, 0.7)',
          border: '1px solid var(--border-panel)',
          borderRadius: '8px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🎙️</span> Operator Voice Controls
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }} className="font-mono">
            Faster-Whisper STT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleVoiceButtonClick}
            disabled={isVoiceProcessing}
            style={{
              backgroundColor: isRecording ? '#ef4444' : 'rgba(6, 182, 212, 0.15)',
              border: `1px solid ${isRecording ? '#ef4444' : 'var(--color-accent-cyan)'}`,
              color: isRecording ? '#ffffff' : 'var(--color-accent-cyan)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              cursor: isVoiceProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{isRecording ? '🔴' : '🎙️'}</span>
            <span>{isRecording ? `Recording... (${recordingSeconds}s) Stop` : isVoiceProcessing ? 'Transcribing Audio...' : 'Voice Assistant Command'}</span>
          </button>

          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: '1.2' }}>
            Click to record a 5s voice command (e.g. <em>"Show me Zone A1"</em>).
          </span>
        </div>

        {/* Voice Command Result Card */}
        {voiceResult && (
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '6px',
              padding: '0.6rem',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
            className="font-mono"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-accent-blue)', fontWeight: 700 }}>
                INTENT MATCHED: {voiceResult.matched_intent}
              </span>
              <span style={{ color: '#10b981', fontSize: '0.65rem' }}>
                Confidence: {voiceResult.confidence}
              </span>
            </div>

            <div style={{ color: '#f8fafc' }}>
              Transcribed: <em>"{voiceResult.transcribed_text}"</em>
            </div>

            {voiceResult.intent_params && Object.keys(voiceResult.intent_params).length > 0 && (
              <div style={{ color: 'var(--color-text-dim)', fontSize: '0.68rem' }}>
                Params: {JSON.stringify(voiceResult.intent_params)}
              </div>
            )}
          </div>
        )}

        {voiceError && (
          <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
            ⚠️ {voiceError}
          </div>
        )}
      </div>

      {/* SECTION 2: Digital Signage Hardware Webhook Trigger */}
      <div className="trigger-subcontainer"
        style={{
          backgroundColor: 'rgba(5, 8, 17, 0.7)',
          border: '1px solid var(--border-panel)',
          borderRadius: '8px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>📺</span> Digital Signage Hardware Webhook
          </div>
          {/* Mandatory Demo Label */}
          <span style={{ fontSize: '0.62rem', color: 'var(--color-status-connecting)' }} className="font-mono">
            (Simulated — no physical signage connected)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={selectedSignageZone}
            onChange={(e) => setSelectedSignageZone(e.target.value)}
            style={{
              backgroundColor: '#090d16',
              color: '#f8fafc',
              border: '1px solid var(--border-panel)',
              borderRadius: '4px',
              padding: '0.35rem 0.6rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          >
            {zones.length > 0
              ? zones.map((z) => (
                  <option key={z.zone_id} value={z.zone_id}>
                    Target: {z.zone_id}
                  </option>
                ))
              : ['zone_A1', 'zone_A2', 'zone_B1', 'zone_B2'].map((id) => (
                  <option key={id} value={id}>
                    Target: {id}
                  </option>
                ))}
          </select>

          <input
            type="text"
            value={signageMessage}
            onChange={(e) => setSignageMessage(e.target.value)}
            placeholder="Emergency signage text message..."
            style={{
              flex: 1,
              backgroundColor: '#090d16',
              border: '1px solid var(--border-panel)',
              borderRadius: '4px',
              padding: '0.35rem 0.6rem',
              fontSize: '0.75rem',
              color: '#f8fafc',
              outline: 'none',
              minWidth: '180px',
            }}
          />

          <button
            onClick={handleSignagePush}
            disabled={isSignageLoading || !signageMessage.trim()}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid var(--border-panel-bright)',
              color: '#f8fafc',
              fontSize: '0.725rem',
              fontWeight: 600,
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              cursor: isSignageLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isSignageLoading ? 'Pushing Webhook...' : 'Simulate Signage Push'}
          </button>
        </div>

        {/* Signage Response Card */}
        {signageResponse && (
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              fontSize: '0.725rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
            }}
            className="font-mono"
          >
            <div style={{ color: '#10b981', fontWeight: 700 }}>
              ✓ Signage Webhook Dispatched [{signageResponse.status}]
            </div>
            <div style={{ color: 'var(--color-text-muted)' }}>
              Target LED Boards: {signageResponse.target_signage_ids?.join(', ')}
            </div>
            <div style={{ color: 'var(--color-text-dim)' }}>
              Message: "{signageResponse.message}" (Arrows: {signageResponse.direction_arrows?.join(', ') || 'N/A'})
            </div>
          </div>
        )}

        {signageError && (
          <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
            ⚠️ {signageError}
          </div>
        )}
      </div>

      {/* SECTION 3: Social Media Sentiment Monitor Mini-Widget */}
      <div className="trigger-subcontainer"
        style={{
          backgroundColor: 'rgba(5, 8, 17, 0.7)',
          border: '1px solid var(--border-panel)',
          borderRadius: '8px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🌐</span> Social Unrest Sentiment Monitor
          </div>
          {/* Mandatory Demo Label */}
          <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)' }} className="font-mono">
            (Demo: sample social media dataset)
          </span>
        </div>

        {/* Aggregated Unrest Score Gauge Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }} className="font-mono">
            <span style={{ color: 'var(--color-text-muted)' }}>Aggregated Unrest Index:</span>
            <span style={{ fontWeight: 700, color: unrestColor }}>
              {(unrestScore * 100).toFixed(0)}% [{unrestScore > 0.6 ? 'HIGH RISK' : unrestScore > 0.3 ? 'MODERATE' : 'LOW'}]
            </span>
          </div>

          {/* Progress / Gauge Bar */}
          <div
            style={{
              height: '8px',
              backgroundColor: '#090d16',
              borderRadius: '4px',
              overflow: 'hidden',
              border: '1px solid var(--border-panel)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(Math.max(unrestScore * 100, 5), 100)}%`,
                backgroundColor: unrestColor,
                transition: 'width 0.4s ease, background-color 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Flagged Social Posts List */}
        {isSentimentLoading && !sentimentData ? (
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>Loading sentiment feed...</div>
        ) : sentimentData?.flagged_posts && sentimentData.flagged_posts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase' }} className="font-mono">
              High-Urgency Flagged Social Feed ({sentimentData.flagged_posts.length} posts):
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto' }}>
              {sentimentData.flagged_posts.map((post, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#090d16',
                    border: '1px solid var(--border-panel)',
                    borderRadius: '4px',
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.7rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-accent-blue)', fontWeight: 600 }} className="font-mono">
                      Post #{idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '0.6rem',
                        color: post.urgency === 'high' ? '#ef4444' : 'var(--color-status-connecting)',
                        fontWeight: 700,
                      }}
                      className="font-mono"
                    >
                      Urgency: {post.urgency}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-main)', fontStyle: 'italic' }}>"{post.text}"</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            No high-urgency social unrest posts detected.
          </div>
        )}

        {sentimentError && (
          <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
            ⚠️ {sentimentError}
          </div>
        )}
      </div>

      {/* SECTION 4: Multilingual Public Address (PA) */}
      <div className="trigger-subcontainer"
        style={{
          backgroundColor: 'rgba(5, 8, 17, 0.7)',
          border: '1px solid var(--border-panel)',
          borderRadius: '8px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>📢</span> Multilingual Public Address (PA)
          </div>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)' }} className="font-mono">
            (GenAI Translation + Edge-TTS)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={selectedSignageZone}
            onChange={(e) => setSelectedSignageZone(e.target.value)}
            style={{
              backgroundColor: '#090d16',
              border: '1px solid var(--border-input)',
              color: 'var(--color-text-main)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.75rem',
            }}
          >
            {zones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                Zone {z.zone_id}
              </option>
            ))}
            {zones.length === 0 && <option value="zone_A1">Zone A1</option>}
          </select>

          <input
            type="text"
            value={announcementMessage}
            onChange={(e) => setAnnouncementMessage(e.target.value)}
            placeholder="Type base English message..."
            style={{
              flex: 1,
              backgroundColor: '#090d16',
              border: '1px solid var(--border-input)',
              color: 'var(--color-text-main)',
              borderRadius: '4px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <button
            onClick={handleAnnouncementPush}
            disabled={isAnnouncementLoading || !announcementMessage.trim()}
            style={{
              backgroundColor: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid var(--color-accent-cyan)',
              color: 'var(--color-accent-cyan)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.4rem 0.85rem',
              borderRadius: '4px',
              cursor: isAnnouncementLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isAnnouncementLoading ? 'Synthesizing Audio...' : 'Broadcast Announcement'}
          </button>
        </div>

        {/* Announcement Result: TTS Audio Players & Previews */}
        {announcementResponse && (
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
              ✓ Announcement Synthesized & Dispatched
            </div>

            {/* TTS Audio Player per Language */}
            {announcementResponse.translations && Object.keys(announcementResponse.translations).length > 0 && (
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', marginBottom: '0.25rem' }} className="font-mono">
                  TTS AUDIO BROADCAST PREVIEWS:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {Object.entries(announcementResponse.translations).map(([lang, detail]: [string, any]) => {
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
          </div>
        )}

        {announcementError && (
          <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
            ⚠️ {announcementError}
          </div>
        )}
      </div>

    </div>
  );
};

export default ExternalTriggersPanel;
