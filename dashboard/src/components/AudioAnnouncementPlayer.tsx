import React, { useEffect, useState } from 'react';
import { globalAudio } from '../services/audioService';

interface AudioAnnouncementPlayerProps {
  audioUrl?: string | null;
  text?: string;
  languageCode?: string;
  label?: string;
}

const REGIONAL_LANG_VOICE_MAP: Record<string, string> = {
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  en: 'en-US',
};

export const AudioAnnouncementPlayer: React.FC<AudioAnnouncementPlayerProps> = ({
  audioUrl,
  text,
  languageCode = 'hi',
  label,
}) => {
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);
  const [playbackState, setPlaybackState] = useState<{
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  // Normalize audio path
  const resolvedUrl = React.useMemo(() => {
    if (!audioUrl) return null;
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      return audioUrl;
    }
    const cleanPath = audioUrl.replace(/\\/g, '/').replace(/^\//, '');
    return `/${cleanPath}`;
  }, [audioUrl]);

  // Subscribe to persistent global audio manager
  useEffect(() => {
    if (!resolvedUrl) return;

    // Initial state check
    const initial = globalAudio.getState(resolvedUrl);
    setPlaybackState({
      isPlaying: initial.isPlaying,
      currentTime: initial.currentTime,
      duration: initial.duration,
    });

    const unsubscribe = globalAudio.subscribe((state) => {
      if (state.url === resolvedUrl) {
        setPlaybackState({
          isPlaying: state.isPlaying,
          currentTime: state.currentTime,
          duration: state.duration,
        });
      } else {
        setPlaybackState((prev) => (prev.isPlaying ? { ...prev, isPlaying: false } : prev));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [resolvedUrl]);

  // Handle SpeechSynthesis playback
  const speakText = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    globalAudio.pause();

    if (isSpeechPlaying) {
      setIsSpeechPlaying(false);
      return;
    }

    const message = text || '';
    if (!message) return;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = REGIONAL_LANG_VOICE_MAP[languageCode] || 'hi-IN';
    utterance.rate = 0.92;
    utterance.onstart = () => setIsSpeechPlaying(true);
    utterance.onend = () => setIsSpeechPlaying(false);
    utterance.onerror = () => setIsSpeechPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isSpeechPlaying) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeechPlaying(false);
    }

    if (!resolvedUrl) {
      speakText();
      return;
    }

    globalAudio.toggle(resolvedUrl);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = parseFloat(e.target.value);
    setPlaybackState((prev) => ({ ...prev, currentTime: seekTo }));
    globalAudio.seek(seekTo);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isPlaying = playbackState.isPlaying;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        padding: '0.65rem 0.85rem',
        backgroundColor: '#0d1322',
        borderRadius: '6px',
        border: isPlaying || isSpeechPlaying ? '1px solid var(--color-accent-cyan)' : '1px solid var(--border-panel)',
        boxShadow: isPlaying ? '0 0 14px rgba(6, 182, 212, 0.2)' : undefined,
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-blue)', fontWeight: 600, flex: 1 }}>
          <span style={{ color: 'var(--color-accent-cyan)', fontWeight: 700 }}>[{languageCode.toUpperCase()}]</span>{' '}
          {text || label}
        </div>
        <button
          type="button"
          onClick={speakText}
          style={{
            backgroundColor: isSpeechPlaying ? 'rgba(34, 197, 94, 0.25)' : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${isSpeechPlaying ? '#22c55e' : 'rgba(59, 130, 246, 0.4)'}`,
            color: isSpeechPlaying ? '#4ade80' : '#93c5fd',
            borderRadius: '4px',
            padding: '0.2rem 0.5rem',
            fontSize: '0.68rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
            whiteSpace: 'nowrap',
          }}
          title="Synthesize and play speech locally"
        >
          {isSpeechPlaying ? '⏹ Voice' : '🔊 TTS'}
        </button>
      </div>

      {/* Custom Audio Scrubber Timeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem' }}>
        {/* Play/Pause Button on the Timeline */}
        <button
          type="button"
          onClick={togglePlay}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: isPlaying ? 'rgba(34, 197, 94, 0.3)' : 'rgba(139, 92, 246, 0.3)',
            border: `1.5px solid ${isPlaying ? '#22c55e' : 'var(--color-accent-purple)'}`,
            color: isPlaying ? '#4ade80' : '#c4b5fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            boxShadow: isPlaying ? '0 0 8px rgba(34, 197, 94, 0.4)' : undefined,
          }}
          title={isPlaying ? 'Pause Audio' : 'Play Audio'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Timeline track & scrubber */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              type="range"
              min={0}
              max={playbackState.duration > 0 ? playbackState.duration : 100}
              step={0.02}
              value={playbackState.currentTime}
              onChange={handleSeek}
              disabled={!resolvedUrl}
              style={{
                width: '100%',
                height: '6px',
                accentColor: isPlaying ? '#22c55e' : '#a78bfa',
                cursor: 'pointer',
                borderRadius: '3px',
                outline: 'none',
              }}
              title="Scrub announcement audio timeline"
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.66rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-dim)',
            }}
          >
            <span style={{ color: isPlaying ? '#67e8f9' : 'inherit' }}>{formatTime(playbackState.currentTime)}</span>
            <span>{formatTime(playbackState.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
