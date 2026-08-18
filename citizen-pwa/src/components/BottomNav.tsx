
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';

interface BottomNavProps {
  activeTab: 'alerts' | 'map' | 'report' | 'settings';
  onTabChange: (tab: 'alerts' | 'map' | 'report' | 'settings') => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const lang = useAppStore((state) => state.selectedLanguage);

  return (
    <nav className="bottom-nav">
      <button 
        className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
        onClick={() => onTabChange('alerts')}
      >
        <span className="nav-icon">⚠️</span>
        <span>{getTranslation(lang, 'alerts')}</span>
      </button>
      <button 
        className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => onTabChange('map')}
      >
        <span className="nav-icon">🗺️</span>
        <span>{getTranslation(lang, 'safeMap')}</span>
      </button>
      <button 
        className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
        onClick={() => onTabChange('report')}
      >
        <span className="nav-icon">📷</span>
        <span>{getTranslation(lang, 'reportIncident')}</span>
      </button>
      <button 
        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        <span className="nav-icon">⚙️</span>
        <span>{getTranslation(lang, 'settings')}</span>
      </button>
    </nav>
  );
}
