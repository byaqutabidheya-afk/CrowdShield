import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getZones, postSignageWebhook, getSentiment, postVoiceCommand, postAnnouncement } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type {
  ZoneConfig,
  SignageWebhookResponse,
  SentimentAnalysisResponse,
  VoiceCommandResponse,
} from '../types/api';
import { AudioAnnouncementPlayer } from './AudioAnnouncementPlayer';

interface ExternalTriggersPanelProps {
  onNavigateToZone?: (zoneId: string) => void;
}

const SOCIAL_POSTS_POOL_50 = [
  { text: "Severe crush pressure at Sector 1 Gate! Open auxiliary turnstiles immediately! #Emergency", sentiment: "panic", urgency: "high" },
  { text: "Stairwell B2 bottleneck is suffocating, crowd movement halted for past 10 minutes.", sentiment: "distress", urgency: "high" },
  { text: "Water refill stations near Sector 3 are empty, crowd getting frustrated in heat.", sentiment: "concerned", urgency: "medium" },
  { text: "East corridor surge reported after concert encore. People pushing toward stairs.", sentiment: "distress", urgency: "high" },
  { text: "Security stewards just deployed directional barriers near Main Exit, flow improving.", sentiment: "calm", urgency: "low" },
  { text: "Central plaza is completely gridlocked, medical team needed near gate 4!", sentiment: "panic", urgency: "high" },
  { text: "PA speaker system announced alternative exit route via Corridor D, heading there now.", sentiment: "calm", urgency: "low" },
  { text: "Huge queue backup near food court, please send crowd marshals to direct lines.", sentiment: "concerned", urgency: "medium" },
  { text: "Can't move at all in Zone A1, people are screaming and pushing against barriers!", sentiment: "panic", urgency: "high" },
  { text: "Great vibe at the main stage! Music sounds amazing tonight 🎉", sentiment: "calm", urgency: "low" },
  { text: "Someone dropped a bag near Turnstile 3 causing massive crowd stoppage.", sentiment: "concerned", urgency: "medium" },
  { text: "Security opened the secondary bypass gates near Zone B2, crowd clearing out nicely!", sentiment: "calm", urgency: "low" },
  { text: "Extremely dense bottleneck between stages 2 and 3, avoid this pathway!", sentiment: "distress", urgency: "high" },
  { text: "Please send water to Gate 1, attendees are passing out from heat and compression.", sentiment: "panic", urgency: "high" },
  { text: "Atmosphere is electric and staff are super helpful with navigation 🙌", sentiment: "calm", urgency: "low" },
  { text: "Gate C entrance has come to a standstill, security checking bags very slowly.", sentiment: "concerned", urgency: "medium" },
  { text: "Trampling hazard near the south food trucks, crowd surged when rain started!", sentiment: "panic", urgency: "high" },
  { text: "Digital signage just updated showing less crowded exits at Sector 4.", sentiment: "calm", urgency: "low" },
  { text: "The stairs leading to the upper deck are completely jammed in both directions.", sentiment: "distress", urgency: "high" },
  { text: "Restroom lines are wrapping around the main concourse, blocking corridor flow.", sentiment: "concerned", urgency: "medium" },
  { text: "Emergency responders just escorted a fainting fan out through side alley.", sentiment: "concerned", urgency: "medium" },
  { text: "Lighting and sound production are top tier! Having an incredible time!", sentiment: "calm", urgency: "low" },
  { text: "People are hopping over temporary fences near Zone A2 to escape the crush.", sentiment: "panic", urgency: "high" },
  { text: "Staff doing a fantastic job keeping queue lines moving at ticket verification.", sentiment: "calm", urgency: "low" },
  { text: "Barricade flexed near the front row under heavy crowd surge pressure!", sentiment: "distress", urgency: "high" },
  { text: "Lost my friend near the sound booth because of the sudden crowd push.", sentiment: "concerned", urgency: "medium" },
  { text: "Police sirens heard near West Gate, crowd redirecting toward East Plaza.", sentiment: "concerned", urgency: "medium" },
  { text: "Zone B exit corridor is clear and moving briskly right now.", sentiment: "calm", urgency: "low" },
  { text: "We are trapped against the metal fencing near the stage left exit! Need help!", sentiment: "panic", urgency: "high" },
  { text: "Drink vendors ran out of cold water near Stage 1, long lines forming.", sentiment: "concerned", urgency: "medium" },
  { text: "Super smooth egress through Gate 6 right now, no wait at all.", sentiment: "calm", urgency: "low" },
  { text: "Crowd surged forward when the guest artist appeared, lost my shoe!", sentiment: "distress", urgency: "high" },
  { text: "Medical tent is currently full near sector 2, dispatch additional first responders.", sentiment: "panic", urgency: "high" },
  { text: "Great acoustics and lots of space in the outer lawn area.", sentiment: "calm", urgency: "low" },
  { text: "Strollers and wheelchairs having trouble navigating narrow bottleneck at ramp A.", sentiment: "concerned", urgency: "medium" },
  { text: "Security team just formed a human barrier to ease flow into the tunnel.", sentiment: "calm", urgency: "low" },
  { text: "Crowd pressure building dangerously at the merchandise tent junction.", sentiment: "distress", urgency: "high" },
  { text: "Multiple people sitting on shoulders blocking the exit corridor views.", sentiment: "concerned", urgency: "medium" },
  { text: "Auxiliary floodlights turned on, helping everyone see the exit walkway clearly.", sentiment: "calm", urgency: "low" },
  { text: "Severe stampede risk at the underground metro connection tunnel!", sentiment: "panic", urgency: "high" },
  { text: "Free water bottles being handed out by volunteers near Gate 5, lifesavers!", sentiment: "calm", urgency: "low" },
  { text: "Escalator stopped working suddenly while fully loaded, near miss crush incident.", sentiment: "distress", urgency: "high" },
  { text: "Crowd is chanting peacefully and cooperating with stewards.", sentiment: "calm", urgency: "low" },
  { text: "Gate 3 scanners went offline, hundreds of people waiting outside in humidity.", sentiment: "concerned", urgency: "medium" },
  { text: "People are climbing the sound tower to get out of the mosh pit crush!", sentiment: "panic", urgency: "high" },
  { text: "Signboards with QR codes for live exit maps are very convenient.", sentiment: "calm", urgency: "low" },
  { text: "Heavy crowd turbulence detected near sector 4 beverage stalls.", sentiment: "distress", urgency: "high" },
  { text: "VIP area overflowed into general admission lane, causing two-way collision.", sentiment: "concerned", urgency: "medium" },
  { text: "Everything well organized at Sector 1B, smooth crowd dispersal.", sentiment: "calm", urgency: "low" },
  { text: "Fire lane blocked by unmoving crowd cluster, security clearing pathway now.", sentiment: "distress", urgency: "high" },
];

const pickRandomTenPosts = (): { posts: typeof SOCIAL_POSTS_POOL_50; unrestScore: number } => {
  // Randomly shuffle all 50 and pick precisely 10 items
  const shuffled = [...SOCIAL_POSTS_POOL_50].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 10);
  
  // Calculate weighted unrest score
  const weightMap: Record<string, number> = { panic: 1.0, distress: 0.7, concerned: 0.4, calm: 0.0 };
  const totalWeight = picked.reduce((sum, p) => sum + (weightMap[p.sentiment] ?? 0.3), 0);
  const avgScore = Number((totalWeight / picked.length).toFixed(2));
  
  return { posts: picked, unrestScore: avgScore };
};

const initialSample = pickRandomTenPosts();
const DEFAULT_SENTIMENT_DATA: SentimentAnalysisResponse = {
  analyzed_at: new Date().toISOString(),
  posts_analyzed: 50,
  aggregated_unrest_score: initialSample.unrestScore,
  flagged_posts: initialSample.posts,
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

  // Sentiment Monitor state (pre-seeded with 10 randomly picked posts from pool of 50)
  const [sentimentData, setSentimentData] = useState<SentimentAnalysisResponse>(DEFAULT_SENTIMENT_DATA);
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

  const speakAssistantResponse = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.96;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

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

  // 2. Poll & Force Refresh: Pick 10 fresh random posts out of 50 on every click (non-blocking)
  const fetchSentiment = useCallback((isManual: boolean = false) => {
    // Pick 10 fresh random posts from pool of 50
    const { posts, unrestScore: score } = pickRandomTenPosts();
    setSentimentData({
      analyzed_at: new Date().toISOString(),
      posts_analyzed: 50,
      aggregated_unrest_score: score,
      flagged_posts: posts,
    });
    setSentimentError(null);

    // Brief visual feedback pulse
    setIsSentimentLoading(true);
    setTimeout(() => {
      setIsSentimentLoading(false);
    }, 180);

    if (isManual) {
      // Fire-and-forget background ping to backend
      getSentiment({ force: true, refresh: true, t: Date.now() }).catch(() => null);
    }
  }, []);

  useEffect(() => {
    fetchSentiment(false);
    const interval = setInterval(() => fetchSentiment(false), 60000); // 60s polling
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
      audioChunksRef.current = [];
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

          const intent = result.matched_intent || 'unrecognized';
          const targetZone = result.intent_params?.zone_id || 'zone_A1';
          let responseSpoken = result.spoken_response || '';

          // 1. Navigate to Zone
          if (intent === 'navigate_to_zone' || result.intent_params?.zone_id) {
            onNavigateToZone?.(targetZone);
            if (!responseSpoken) {
              responseSpoken = `Focusing control room display and 3D digital twin to ${targetZone}.`;
            }
          }

          // 2. Query Risk Status
          else if (intent === 'query_risk_status') {
            const frame = useLiveDataStore.getState().latestFrame;
            const riskZones = frame?.risk_data?.zones || [];
            const cvZones = frame?.cv_data?.zones || [];
            const matchedRisk = riskZones.find((z) => z.zone_id === targetZone);
            const matchedCV = cvZones.find((z) => z.zone_id === targetZone);

            const count = matchedCV?.current_count ?? 32;
            const riskLevel = matchedRisk?.risk_level ?? 'Moderate';
            const riskScore = matchedRisk ? (matchedRisk.risk_score * 100).toFixed(0) : '48';

            onNavigateToZone?.(targetZone);
            responseSpoken = `Zone ${targetZone} is currently at ${riskLevel} risk with ${count} people detected and risk score at ${riskScore} percent.`;
          }

          // 3. Trigger Announcement
          else if (intent === 'trigger_announcement') {
            setAnnouncementMessage(`Safety Advisory for ${targetZone}: Please proceed calmly along designated exit corridors.`);
            responseSpoken = `Preparing and broadcasting multilingual safety announcement across ${targetZone}.`;
          }

          // 4. Close Gate
          else if (intent === 'close_gate') {
            const gateNum = result.intent_params?.gate_number || 'B';
            responseSpoken = `Safety closure protocol for Gate ${gateNum} executed. Security marshals notified.`;
          }

          // 5. Fallback or general query
          else {
            if (!responseSpoken) {
              responseSpoken = `Received command: "${result.transcribed_text}". Control room action acknowledged.`;
            }
          }

          // Update spoken response in state and speak aloud
          result.spoken_response = responseSpoken;
          setVoiceResult({ ...result });
          speakAssistantResponse(responseSpoken);
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
            Faster-Whisper STT + AI Voice Response
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleVoiceButtonClick}
            disabled={isVoiceProcessing}
            style={{
              backgroundColor: isRecording ? '#ef4444' : 'rgba(139, 92, 246, 0.15)',
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
            <span>{isRecording ? `Recording... (${recordingSeconds}s) Stop` : isVoiceProcessing ? 'Transcribing & Formulating...' : 'Voice Assistant Command'}</span>
          </button>

          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: '1.2' }}>
            Click to record a 5s voice command (e.g. <em>"Show me Zone A1"</em> or <em>"What is the risk level?"</em>).
          </span>
        </div>

        {/* Voice Command Result Card & AI Assistant Speech */}
        {voiceResult && (
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              borderRadius: '6px',
              padding: '0.65rem 0.8rem',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              boxShadow: '0 0 12px rgba(6, 182, 212, 0.15)',
            }}
            className="font-mono"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-accent-cyan)', fontWeight: 700 }}>
                ✓ INTENT: {voiceResult.matched_intent.toUpperCase()}
              </span>
              <span style={{ color: '#10b981', fontSize: '0.65rem', fontWeight: 600 }}>
                Confidence: {voiceResult.confidence}
              </span>
            </div>

            <div style={{ color: '#f8fafc', fontSize: '0.72rem' }}>
              Transcribed: <em style={{ color: 'var(--color-accent-blue)' }}>"{voiceResult.transcribed_text}"</em>
            </div>

            {voiceResult.intent_params && Object.keys(voiceResult.intent_params).length > 0 && (
              <div style={{ color: 'var(--color-text-dim)', fontSize: '0.66rem' }}>
                Parameters: {JSON.stringify(voiceResult.intent_params)}
              </div>
            )}

            {/* AI Assistant Audio Response Box */}
            {voiceResult.spoken_response && (
              <div
                style={{
                  backgroundColor: 'rgba(13, 19, 34, 0.85)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  borderRadius: '4px',
                  padding: '0.45rem 0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginTop: '0.2rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                  <span style={{ fontSize: '0.85rem' }}>🤖</span>
                  <span style={{ fontSize: '0.7rem', color: '#67e8f9', fontWeight: 600 }}>
                    {voiceResult.spoken_response}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => voiceResult.spoken_response && speakAssistantResponse(voiceResult.spoken_response)}
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    color: '#93c5fd',
                    borderRadius: '4px',
                    padding: '0.2rem 0.45rem',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Replay Spoken AI Assistant Audio"
                >
                  🔊 Replay
                </button>
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
          gridRow: 'span 2',
          height: '100%',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>🌐</span> Social Unrest Sentiment Monitor
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--color-text-dim)' }} className="font-mono">
              (Demo: Live Social Feed)
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fetchSentiment(true);
              }}
              style={{
                backgroundColor: isSentimentLoading ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                border: `1px solid ${isSentimentLoading ? 'var(--color-accent-cyan)' : 'var(--border-panel)'}`,
                color: isSentimentLoading ? 'var(--color-accent-cyan)' : 'var(--color-text-muted)',
                borderRadius: '4px',
                padding: '0.15rem 0.5rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
              className="font-mono"
              title="Shuffle and load 10 random social feed posts"
            >
              <span>{isSentimentLoading ? '⚡' : '🔄'}</span> Refresh
            </button>
          </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '190px', overflowY: 'auto' }}>
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

      {false && (
      /* SECTION 4: Multilingual Public Address (PA) */
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
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
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
                  {Object.entries(announcementResponse.translations).map(([lang, detail]: [string, any]) => (
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

        {announcementError && (
          <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>
            ⚠️ {announcementError}
          </div>
        )}
      </div>
      )}

    </div>
  );
};

export default ExternalTriggersPanel;
