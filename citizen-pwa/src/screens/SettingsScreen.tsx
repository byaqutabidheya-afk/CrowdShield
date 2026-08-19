import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import type { Language } from '../i18n/translations';
import { registerForPush, setupForegroundMessaging, showLocalNotification } from '../services/push';

export default function SettingsScreen() {
  const { selectedLanguage, setSelectedLanguage, clientDeviceId, userLocation, setUserLocation } = useAppStore();
  const [locPermission, setLocPermission] = useState<string>('prompt');
  const [pushPermission, setPushPermission] = useState<string>('prompt');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const checkPermissions = () => {
    // Check location
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

    // Check notifications
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
      setActionFeedback('Requesting GPS location...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocPermission('granted');
          setActionFeedback('✓ GPS location successfully enabled!');
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
    setActionFeedback('Requesting notification permission...');
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
        setActionFeedback('⚠️ Push Notifications require HTTPS or PWA Installation.');
      }
    } catch (e: any) {
      console.error('Notification error:', e);
      setActionFeedback(`⚠️ Error: ${e?.message || 'Could not enable push'}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleTestNotification = () => {
    showLocalNotification('🚨 CrowdShield Alert Test', 'Proximity warning test: High crowd density detected near Gate B.');
    setActionFeedback('✓ Test notification triggered!');
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const renderBadge = (status: string) => {
    if (status === 'granted') {
      return <span style={{ color: 'var(--success-color)', fontWeight: 700 }}>✓ {getTranslation(selectedLanguage, 'permissionGranted')}</span>;
    } else if (status === 'denied') {
      return <span style={{ color: 'var(--error-color)', fontWeight: 700 }}>✕ {getTranslation(selectedLanguage, 'permissionDenied')}</span>;
    } else {
      return <span style={{ color: 'var(--warning-color)', fontWeight: 700 }}>● {getTranslation(selectedLanguage, 'permissionPrompt')}</span>;
    }
  };

  return (
    <div style={{ paddingBottom: '24px' }}>
      <h1>{getTranslation(selectedLanguage, 'settings')}</h1>
      
      {/* Toast Feedback */}
      {actionFeedback && (
        <div style={{
          backgroundColor: '#1e293b',
          color: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          {actionFeedback}
        </div>
      )}

      {/* Language Selector */}
      <div className="settings-group">
        <label className="settings-label">
          {getTranslation(selectedLanguage, 'language')}
        </label>
        <select 
          className="select-input" 
          value={selectedLanguage} 
          onChange={handleLanguageChange}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="ta">தமிழ் (Tamil)</option>
          <option value="te">తెలుగు (Telugu)</option>
          <option value="bn">বাংলা (Bengali)</option>
          <option value="mr">मराठी (Marathi)</option>
        </select>
      </div>

      {/* Location Permission */}
      <div className="settings-group">
        <label className="settings-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{getTranslation(selectedLanguage, 'locationPermission')}</span>
          <span style={{ fontSize: '0.875rem' }}>{renderBadge(locPermission)}</span>
        </label>
        
        <div style={{
          backgroundColor: 'white',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '10px',
          fontSize: '0.85rem',
          lineHeight: 1.4,
          color: 'var(--text-secondary)'
        }}>
          {getTranslation(selectedLanguage, 'locationExplanation')}
          {userLocation && (
            <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--primary-color)', fontWeight: 600 }}>
              📍 GPS Active: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
            </div>
          )}
        </div>

        <button 
          onClick={handleRequestLocation}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: locPermission === 'granted' ? '#10b981' : 'var(--primary-color)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <span>📍</span>
          <span>{locPermission === 'granted' ? 'Refresh GPS Location' : getTranslation(selectedLanguage, 'requestPermission')}</span>
        </button>
      </div>

      {/* Push Notifications Permission */}
      <div className="settings-group">
        <label className="settings-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Push Notifications</span>
          <span style={{ fontSize: '0.875rem' }}>{renderBadge(pushPermission)}</span>
        </label>
        
        <div style={{
          backgroundColor: 'white',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '10px',
          fontSize: '0.85rem',
          lineHeight: 1.4,
          color: 'var(--text-secondary)'
        }}>
          Used for venue-wide and zone emergency alerts, evacuation broadcasts, and real-time safety advisories.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            onClick={handleRequestPush}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: pushPermission === 'granted' ? '#10b981' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>🔔</span>
            <span>{pushPermission === 'granted' ? 'Notifications Enabled' : 'Enable Push Notifications'}</span>
          </button>

          <button 
            onClick={handleTestNotification}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🧪</span>
            <span>Test In-App Alert Notification</span>
          </button>
        </div>
      </div>

      {/* Device ID Info */}
      <div className="settings-group" style={{ marginTop: '24px', opacity: 0.6 }}>
        <label className="settings-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
          Device ID (Internal)
        </label>
        <p style={{ fontSize: '0.72rem', wordBreak: 'break-all', margin: 0, fontFamily: 'monospace' }}>
          {clientDeviceId}
        </p>
      </div>
    </div>
  );
}
