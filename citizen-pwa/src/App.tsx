import { useState, useEffect } from 'react';
import { useLiveWebSocket } from './hooks/useLiveWebSocket';
import { useForegroundGeofencing } from './hooks/useForegroundGeofencing';
import { useAppStore } from './store/appStore';
import { registerForPush, setupForegroundMessaging } from './services/push';
import AlertsScreen from './screens/AlertsScreen';
import SafeMapScreen from './screens/SafeMapScreen';
import ReportScreen from './screens/ReportScreen';
import SettingsScreen from './screens/SettingsScreen';
import BottomNav from './components/BottomNav';

export default function App() {
  useLiveWebSocket();
  useForegroundGeofencing();
  const [activeTab, setActiveTab] = useState<'alerts' | 'map' | 'report' | 'settings'>('alerts');
  const connectionStatus = useAppStore(state => state.connectionStatus);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Attempt registration silently if already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      registerForPush();
      setupForegroundMessaging();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        registerForPush();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // PWA Install Prompt handling
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // Prevent the mini-infobar from appearing on mobile
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the install prompt`);
    setDeferredPrompt(null);
  };

  return (
    <>
      {connectionStatus === 'connecting' && (
        <div className="connection-banner banner-connecting">Connecting to live feed...</div>
      )}
      {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
        <div className="connection-banner banner-error">Connection lost. Reconnecting...</div>
      )}

      {/* PWA Install Banner */}
      {deferredPrompt && (
        <div style={{
          position: 'fixed',
          bottom: '80px', // Just above BottomNav
          left: '16px',
          right: '16px',
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 5000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.5rem' }}>📱</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Install CrowdShield</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>Add to Home Screen for fast access</span>
            </div>
          </div>
          <button 
            onClick={handleInstallClick}
            style={{
              background: 'white',
              color: '#3b82f6',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            Install
          </button>
        </div>
      )}
      
      <main className="screen-container">
        {activeTab === 'alerts' && <AlertsScreen onNavigateToMap={() => setActiveTab('map')} />}
        {activeTab === 'map' && <SafeMapScreen />}
        {activeTab === 'report' && <ReportScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
