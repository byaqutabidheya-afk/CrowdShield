import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import type { Language } from '../i18n/translations';

export default function SettingsScreen() {
  const { selectedLanguage, setSelectedLanguage, clientDeviceId } = useAppStore();
  const [locPermission, setLocPermission] = useState<string>('unknown');

  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setLocPermission(result.state);
        result.onchange = () => setLocPermission(result.state);
      }).catch(() => setLocPermission('unsupported'));
    } else {
      setLocPermission('unsupported');
    }
  }, []);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value as Language);
  };

  const handleRequestLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {}, // Success will automatically trigger the permissions onchange above
        () => {}
      );
    }
  };

  const renderPermissionBadge = () => {
    if (locPermission === 'granted') {
      return <span style={{ color: 'var(--success-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionGranted')}</span>;
    } else if (locPermission === 'denied') {
      return <span style={{ color: 'var(--error-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionDenied')}</span>;
    } else {
      return <span style={{ color: 'var(--warning-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionPrompt')}</span>;
    }
  };

  return (
    <div>
      <h1>{getTranslation(selectedLanguage, 'settings')}</h1>
      
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

      <div className="settings-group">
        <label className="settings-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{getTranslation(selectedLanguage, 'locationPermission')}</span>
          <span style={{ fontSize: '0.875rem' }}>{renderPermissionBadge()}</span>
        </label>
        
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '12px',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          color: 'var(--text-secondary)'
        }}>
          {getTranslation(selectedLanguage, 'locationExplanation')}
        </div>

        {locPermission === 'prompt' && (
          <button 
            onClick={handleRequestLocation}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {getTranslation(selectedLanguage, 'requestPermission')}
          </button>
        )}
      </div>

      <div className="settings-group">
        <label className="settings-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Push Notifications</span>
          <span style={{ fontSize: '0.875rem' }}>
            {'Notification' in window && Notification.permission === 'granted' 
              ? <span style={{ color: 'var(--success-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionGranted')}</span>
              : 'Notification' in window && Notification.permission === 'denied'
              ? <span style={{ color: 'var(--error-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionDenied')}</span>
              : <span style={{ color: 'var(--warning-color)', fontWeight: 700 }}>{getTranslation(selectedLanguage, 'permissionPrompt')}</span>
            }
          </span>
        </label>
        
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '12px',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          color: 'var(--text-secondary)'
        }}>
          <strong>Note:</strong> There are two notification mechanisms in this app:
          <ul style={{ marginTop: '8px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>(a) Remote Push (FCM):</strong> Used for venue-wide or zone-wide broadcast alerts sent by the server. Requires the permission above and active network access.
            </li>
            <li>
              <strong>(b) Local Geofence Warnings:</strong> Foreground proximity warnings generated entirely within your browser based on your GPS. These do <strong>NOT</strong> depend on push infrastructure and work even if remote push registration fails.
            </li>
          </ul>
        </div>

        {('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') && (
          <button 
            onClick={async () => {
              const { registerForPush, setupForegroundMessaging } = await import('../services/push');
              await registerForPush();
              setupForegroundMessaging();
              // Force re-render by doing a dummy state update
              setLocPermission(prev => prev + ' ');
              setTimeout(() => setLocPermission(prev => prev.trim()), 100);
            }}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Enable Notifications
          </button>
        )}
      </div>

      <div className="settings-group" style={{ marginTop: '32px', opacity: 0.6 }}>
        <label className="settings-label" style={{ fontSize: '0.875rem', marginBottom: '4px' }}>
          Device ID (Internal)
        </label>
        <p style={{ fontSize: '0.75rem', wordBreak: 'break-all', margin: 0 }}>
          {clientDeviceId}
        </p>
      </div>
    </div>
  );
}
