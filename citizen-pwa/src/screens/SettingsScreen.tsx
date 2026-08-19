import { useEffect, useState } from 'react';
import { 
  Languages, 
  MapPin, 
  Bell, 
  Sparkles, 
  Cpu, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  Clock 
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import type { Language } from '../i18n/translations';
import { registerForPush, setupForegroundMessaging, showLocalNotification } from '../services/push';

export default function SettingsScreen() {
  const { selectedLanguage, setSelectedLanguage, clientDeviceId, userLocation, setUserLocation } = useAppStore();
  const [locPermission, setLocPermission] = useState<string>('prompt');
  const [pushPermission, setPushPermission] = useState<string>('prompt');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const checkPermissions = () => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        setLocPermission(result.state);
        result.onchange = () => setLocPermission(result.state);
      }).catch(() => {
        setLocPermission(userLocation ? 'granted' : 'prompt');
      });
    } else {
      setLocPermission(userLocation ? 'granted' : 'prompt');
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        setPushPermission(Notification.permission);
      } catch {
        setPushPermission('unsupported');
      }
    } else {
      setPushPermission('unsupported');
    }
  };

  useEffect(() => {
    checkPermissions();
  }, [userLocation]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value as Language);
  };

  const handleRequestLocation = () => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setActionFeedback('Requesting GPS location telemetry...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocPermission('granted');
          setActionFeedback('✓ GPS location successfully calibrated!');
          setTimeout(() => setActionFeedback(null), 3000);
        },
        (err) => {
          console.warn('Geolocation error:', err);
          if (err.code === err.PERMISSION_DENIED) {
            setLocPermission('denied');
            setActionFeedback('⚠️ Location was denied in browser settings.');
          } else {
            setActionFeedback(`⚠️ Location error: ${err.message}`);
          }
          setTimeout(() => setActionFeedback(null), 4000);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setActionFeedback('⚠️ Geolocation not supported on this device.');
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleRequestPush = async () => {
    setActionFeedback('Registering notification token with gateway...');
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const token = await registerForPush();
        setupForegroundMessaging();
        setPushPermission(Notification.permission);
        if (token || Notification.permission === 'granted') {
          setActionFeedback('✓ Push Notifications successfully enabled!');
          showLocalNotification('CrowdShield Active', 'Notifications are now configured for emergency alerts.');
        } else {
          setActionFeedback('⚠️ Notification permission not granted.');
        }
      } else {
        setActionFeedback('⚠️ Push Notifications require HTTPS or PWA installation.');
      }
    } catch (e: any) {
      console.error('Notification error:', e);
      setActionFeedback(`⚠️ Error: ${e?.message || 'Could not enable push'}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const playAlertBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // Audio context fallback
    }
  };

  const handleTestNotification = () => {
    playAlertBeep();

    const title = '🚨 Proximity Hazard Simulation';
    const body = 'High crowd bottlenecking detected near Gate B. Please proceed towards East Exit.';
    
    // 1. Show floating in-app notification toast at top of screen
    const store = useAppStore.getState();
    store.triggerInAppNotification(title, body, 'alert');

    // 2. Add to active alerts feed
    store.addAlert({
      zone_id: 'zone_A2',
      risk_level: 'high',
      timestamp: new Date().toISOString(),
      message: { en: body },
      reasoning: 'Automated crowd density sensor exceeded 85% capacity threshold near gate corridor.',
      recommendations: [
        { action: 'Reroute to East Exit', reasoning: 'Bypass congested corridor towards unobstructed East Exit.' }
      ]
    });

    // 3. Trigger system notification if permitted
    showLocalNotification(title, body);

    setActionFeedback('✓ In-app test alert dispatched with audio chime & banner!');
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleCopyDeviceId = () => {
    if (clientDeviceId) {
      navigator.clipboard.writeText(clientDeviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderBadge = (status: string) => {
    if (status === 'granted') {
      return (
        <span style={{ 
          fontSize: '0.65rem', 
          fontWeight: 700, 
          backgroundColor: 'rgba(16, 185, 129, 0.15)', 
          color: '#34d399', 
          border: '1px solid rgba(16, 185, 129, 0.3)', 
          padding: '2px 8px', 
          borderRadius: '99px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <CheckCircle2 size={11} /> {getTranslation(selectedLanguage, 'permissionGranted')}
        </span>
      );
    } else if (status === 'denied') {
      return (
        <span style={{ 
          fontSize: '0.65rem', 
          fontWeight: 700, 
          backgroundColor: 'rgba(239, 68, 68, 0.15)', 
          color: '#f87171', 
          border: '1px solid rgba(239, 68, 68, 0.3)', 
          padding: '2px 8px', 
          borderRadius: '99px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <AlertCircle size={11} /> {getTranslation(selectedLanguage, 'permissionDenied')}
        </span>
      );
    } else {
      return (
        <span style={{ 
          fontSize: '0.65rem', 
          fontWeight: 700, 
          backgroundColor: 'rgba(245, 158, 11, 0.15)', 
          color: '#fbbf24', 
          border: '1px solid rgba(245, 158, 11, 0.3)', 
          padding: '2px 8px', 
          borderRadius: '99px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Clock size={11} /> {getTranslation(selectedLanguage, 'permissionPrompt')}
        </span>
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
          {getTranslation(selectedLanguage, 'settings')}
        </h1>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
          Preferences, sensor permissions, and telemetry configuration
        </p>
      </div>
      
      {/* Toast Feedback */}
      {actionFeedback && (
        <div style={{
          backgroundColor: 'rgba(13, 19, 34, 0.95)',
          color: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: 600,
          border: '1px solid var(--border-panel-bright)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Sparkles size={16} style={{ color: 'var(--color-accent-violet)' }} />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Language Selector Card */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
            <Languages size={16} />
            <span>{getTranslation(selectedLanguage, 'language').toUpperCase()}</span>
          </div>
        </div>

        <div className="glass-card-body" style={{ padding: '14px' }}>
          <select 
            value={selectedLanguage} 
            onChange={handleLanguageChange}
            style={{
              width: '100%',
              backgroundColor: 'rgba(5, 8, 17, 0.7)',
              border: '1px solid var(--border-panel)',
              borderRadius: '10px',
              padding: '10px 14px',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="en" style={{ background: '#090e1a' }}>English</option>
            <option value="hi" style={{ background: '#090e1a' }}>हिन्दी (Hindi)</option>
            <option value="ta" style={{ background: '#090e1a' }}>தமிழ் (Tamil)</option>
            <option value="te" style={{ background: '#090e1a' }}>తెలుగు (Telugu)</option>
            <option value="bn" style={{ background: '#090e1a' }}>বাংলা (Bengali)</option>
            <option value="mr" style={{ background: '#090e1a' }}>मराठी (Marathi)</option>
          </select>
        </div>
      </div>

      {/* Location Permission Card */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
            <MapPin size={16} />
            <span>{getTranslation(selectedLanguage, 'locationPermission').toUpperCase()}</span>
          </div>
          {renderBadge(locPermission)}
        </div>
        
        <div className="glass-card-body" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            {getTranslation(selectedLanguage, 'locationExplanation')}
          </p>

          {userLocation && (
            <div style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }} className="font-mono">
              <MapPin size={13} style={{ color: '#34d399' }} />
              <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
                GPS ACTIVE: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
              </span>
            </div>
          )}

          <button 
            onClick={handleRequestLocation}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '0.82rem',
              background: locPermission === 'granted' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
              boxShadow: locPermission === 'granted' ? '0 4px 14px rgba(16, 185, 129, 0.3)' : undefined
            }}
          >
            <MapPin size={15} />
            <span>{locPermission === 'granted' ? 'Recalibrate GPS Location' : getTranslation(selectedLanguage, 'requestPermission')}</span>
          </button>
        </div>
      </div>

      {/* Push Notifications Card */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
            <Bell size={16} />
            <span>PUSH BROADCASTS</span>
          </div>
          {renderBadge(pushPermission)}
        </div>
        
        <div className="glass-card-body" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            Receives instant venue-wide and zone emergency broadcasts, evacuation triggers, and audio-visual advisories.
          </p>

          <button 
            onClick={handleRequestPush}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '0.82rem',
              background: pushPermission === 'granted' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
              boxShadow: pushPermission === 'granted' ? '0 4px 14px rgba(16, 185, 129, 0.3)' : undefined
            }}
          >
            <Bell size={15} />
            <span>{pushPermission === 'granted' ? 'Push Gateway Connected' : 'Enable Push Notifications'}</span>
          </button>

          <button 
            onClick={handleTestNotification}
            className="btn-secondary"
            style={{ width: '100%', padding: '8px', fontSize: '0.78rem' }}
          >
            <Sparkles size={14} />
            <span>Test In-App Alert Notification</span>
          </button>
        </div>
      </div>

      {/* Device ID / Telemetry Info Card */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
            <Cpu size={16} />
            <span>CLIENT TELEMETRY ID</span>
          </div>

          <button
            onClick={handleCopyDeviceId}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? '#34d399' : 'var(--color-accent-violet)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.7rem',
              fontWeight: 600
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="glass-card-body" style={{ padding: '12px 14px' }}>
          <p className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--color-text-dim)', wordBreak: 'break-all', margin: 0 }}>
            {clientDeviceId}
          </p>
        </div>
      </div>
    </div>
  );
}
