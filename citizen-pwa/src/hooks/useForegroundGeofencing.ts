import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAppStore } from '../store/appStore';
import { checkGeofenceProximity, startLocationTracking, DEMO_CALIBRATION } from '../services/geofencing';
import type { Zone } from '../services/geofencing';

export function useForegroundGeofencing() {
  const { userLocation, activeZoneRisks, setUserLocation, setGeofenceStatus } = useAppStore();
  const [zones, setZones] = useState<Zone[]>([]);
  
  const intervalRef = useRef<number | null>(null);
  
  // Keep latest state in a ref to avoid re-triggering the interval effect constantly
  const stateRef = useRef({ userLocation, activeZoneRisks, zones });
  useEffect(() => {
    stateRef.current = { userLocation, activeZoneRisks, zones };
  }, [userLocation, activeZoneRisks, zones]);

  // 1. Fetch zones on mount to perform boundary checks
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const url = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api';
        const res = await axios.get(`${url}/zones`);
        setZones(res.data);
      } catch (e) {
        console.error('Failed to fetch zones for geofencing', e);
      }
    };
    fetchZones();
  }, []);

  // 2. Start location tracking (requests permission natively via watchPosition)
  useEffect(() => {
    const cleanup = startLocationTracking(
      (loc) => setUserLocation(loc),
      () => {
        console.warn('Location permission denied by user');
        // A real app might set a state here to show a translated "Please enable location" banner
      }
    );
    return cleanup;
  }, [setUserLocation]);

  // 3. Foreground geofencing interval
  /*
   **This is foreground-only geofencing. It is sufficient for this prototype because 
   the citizen PWA is kept open during the demonstration. It does NOT provide reliable 
   warnings if the browser is closed or the phone is locked — that would require native 
   background execution, which is explicitly out of scope for this hackathon build.**
   */
  useEffect(() => {
    const runCheck = () => {
      const { userLocation: loc, activeZoneRisks: risks, zones: z } = stateRef.current;
      if (!loc || z.length === 0) return;
      
      const result = checkGeofenceProximity(loc, z, DEMO_CALIBRATION, risks);
      setGeofenceStatus(result);
    };

    const startInterval = () => {
      if (!intervalRef.current) {
        runCheck();
        intervalRef.current = window.setInterval(runCheck, 15000);
      }
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startInterval();
      } else {
        stopInterval();
      }
    };

    // Initialize based on current visibility
    if (document.visibilityState === 'visible') {
      startInterval();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setGeofenceStatus]);
}
