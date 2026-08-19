import React, { useEffect, useState } from 'react';
import { Shield, Radio, Activity } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [bootText, setBootText] = useState('INITIALIZING SECURE MESH...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setBootText('CALIBRATING VENUE GEOFENCE...');
      setProgress(35);
    }, 400);

    const t2 = setTimeout(() => {
      setBootText('SYNCING LIVE CROWD TELEMETRY...');
      setProgress(75);
    }, 900);

    const t3 = setTimeout(() => {
      setBootText('CROWDSHIELD ACTIVE');
      setProgress(100);
    }, 1400);

    const tExit = setTimeout(() => {
      onComplete();
    }, 1850);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(tExit);
    };
  }, [onComplete]);

  return (
    <div className="crowdshield-splash">
      <div className="crowdshield-splash-grid" />
      <div className="crowdshield-splash-glow crowdshield-splash-glow-left" />
      <div className="crowdshield-splash-glow crowdshield-splash-glow-right" />

      <div className="crowdshield-splash-content">
        <div className="splash-shield-wrapper">
          <div className="splash-shield-pulse" />
          <div className="splash-shield-inner">
            <Shield className="splash-shield-icon" size={44} />
          </div>
        </div>

        <div className="splash-brand-block">
          <div className="splash-badge">
            <Radio size={12} className="splash-badge-icon pulse-dot" />
            <span>CIVILIAN SAFETY COMPANION</span>
          </div>
          <h1 className="splash-title">
            Crowd<span className="splash-title-accent">Shield</span>
          </h1>
          <p className="splash-subtitle">Real-Time Venue Navigation & Crowd Evacuation</p>
        </div>

        <div className="splash-progress-container">
          <div className="splash-progress-track">
            <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="splash-status-row font-mono">
            <span className="splash-status-text">
              <Activity size={12} className="inline-icon" /> {bootText}
            </span>
            <span className="splash-status-pct">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
