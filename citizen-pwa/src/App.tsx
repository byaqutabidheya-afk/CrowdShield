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

  useEffect(() => {
    try {
      // Attempt registration silently if already granted
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
      {connectionStatus === 'connecting' && (
        <div className="connection-banner banner-connecting">Connecting to live feed...</div>
      )}
      {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
        <div className="connection-banner banner-error">Connection lost. Reconnecting...</div>
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
