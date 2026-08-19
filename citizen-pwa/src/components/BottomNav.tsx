import { ShieldAlert, Navigation, FileEdit, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';

interface BottomNavProps {
  activeTab: 'alerts' | 'map' | 'report' | 'settings';
  onTabChange: (tab: 'alerts' | 'map' | 'report' | 'settings') => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const lang = useAppStore((state) => state.selectedLanguage);

  return (
    <nav className="bottom-dock">
      <button 
        className={`dock-item ${activeTab === 'alerts' ? 'active' : ''}`}
        onClick={() => onTabChange('alerts')}
        aria-label="Alerts"
      >
        {activeTab === 'alerts' && <span className="dock-glow-pill" />}
        <div className="dock-icon-wrapper">
          <ShieldAlert size={20} />
        </div>
        <span className="dock-label">{getTranslation(lang, 'alerts')}</span>
      </button>

      <button 
        className={`dock-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => onTabChange('map')}
        aria-label="Safe Map"
      >
        {activeTab === 'map' && <span className="dock-glow-pill" />}
        <div className="dock-icon-wrapper">
          <Navigation size={20} />
        </div>
        <span className="dock-label">{getTranslation(lang, 'safeMap')}</span>
      </button>

      <button 
        className={`dock-item ${activeTab === 'report' ? 'active' : ''}`}
        onClick={() => onTabChange('report')}
        aria-label="Report Incident"
      >
        {activeTab === 'report' && <span className="dock-glow-pill" />}
        <div className="dock-icon-wrapper">
          <FileEdit size={20} />
        </div>
        <span className="dock-label">{getTranslation(lang, 'reportIncident')}</span>
      </button>

      <button 
        className={`dock-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        aria-label="Settings"
      >
        {activeTab === 'settings' && <span className="dock-glow-pill" />}
        <div className="dock-icon-wrapper">
          <SlidersHorizontal size={20} />
        </div>
        <span className="dock-label">{getTranslation(lang, 'settings')}</span>
      </button>
    </nav>
  );
}
