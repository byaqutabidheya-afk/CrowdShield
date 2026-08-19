import { useState, useEffect } from 'react';
import { Shield, Radio, Wifi, WifiOff } from 'lucide-react';
import { useLiveWebSocket } from './hooks/useLiveWebSocket';
import { useForegroundGeofencing } from './hooks/useForegroundGeofencing';
import { useAppStore } from './store/appStore';
import { registerForPush, setupForegroundMessaging } from './services/push';
import AlertsScreen from './screens/AlertsScreen';
import SafeMapScreen from './screens/SafeMapScreen';
import ReportScreen from './screens/ReportScreen';
import SettingsScreen from './screens/SettingsScreen';
import BottomNav from './components/BottomNav';
import SplashScreen from './components/SplashScreen';
import InAppNotificationToast from './components/InAppNotificationToast';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  useLiveWebSocket();
  useForegroundGeofencing();
  const [activeTab, setActiveTab] = useState<'alerts' | 'map' | 'report' | 'settings'>('alerts');
  const connectionStatus = useAppStore(state => state.connectionStatus);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        registerForPush();
        setupForegroundMessaging();
      }
    } catch (e) {
      console.warn('Silent push registration skipped:', e);
    }

    const handleVisibilityChange = () => {
      try {
        if (document.visibilityState === 'visible' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          registerForPush();
        }
      } catch (e) {
        console.warn('Visibility change push registration error:', e);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <>
      <InAppNotificationToast />
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Modern App Header */}
      <header className="app-header">
        <div className="app-brand">
          <div className="app-brand-icon">
            <Shield size={18} />
          </div>
          <div className="app-brand-title">
            Crowd<span>Shield</span>
          </div>
        </div>

        <div className="app-header-badge">
          {connectionStatus === 'connected' ? (
            <>
              <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34d399' }} />
              <Wifi size={12} />
              <span>LIVE MESH</span>
            </>
          ) : (
            <>
              <WifiOff size={12} style={{ color: '#f87171' }} />
              <span style={{ color: '#f87171' }}>OFFLINE</span>
            </>
          )}
        </div>
      </header>

      {connectionStatus === 'connecting' && (
        <div className="connection-banner banner-connecting">
          <Radio size={12} className="pulse-dot" /> Connecting to live mesh telemetry...
        </div>
      )}
      {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
        <div className="connection-banner banner-error">
          <WifiOff size={12} /> Live stream disconnected. Reconnecting in background...
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
