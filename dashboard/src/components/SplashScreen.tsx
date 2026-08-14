import React, { useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  durationMs?: number;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete, durationMs = 2400 }) => {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onComplete]);

  return (
    <div className="crowdshield-splash" role="status" aria-label="Loading CrowdShield dashboard">
      <div className="crowdshield-splash-grid" aria-hidden="true" />
      <div className="crowdshield-splash-glow crowdshield-splash-glow-left" aria-hidden="true" />
      <div className="crowdshield-splash-glow crowdshield-splash-glow-right" aria-hidden="true" />
      <div className="crowdshield-splash-content">
        <div className="crowdshield-splash-kicker">AI-POWERED CROWD SAFETY SYSTEM</div>
        <div className="crowdshield-splash-logo-mark" aria-hidden="true"><span /><span /><span /></div>
        <h1>CROWD SHIELD</h1>
        <p className="crowdshield-splash-motto">PREDICT. PREVENT. PROTECT.</p>
        <div className="crowdshield-splash-divider" />
        <p className="crowdshield-splash-team">MERAKI PRIME</p>
        <div className="crowdshield-splash-loading" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
};

export default SplashScreen;
