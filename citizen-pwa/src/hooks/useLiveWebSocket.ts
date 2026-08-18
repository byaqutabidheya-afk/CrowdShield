import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';

export function useLiveWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  
  const { setConnectionStatus, setActiveZoneRisks, addAlert } = useAppStore();

  const connect = useCallback(() => {
    // Prevent multiple connections
    if (ws.current?.readyState === WebSocket.CONNECTING || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    const url = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8000/ws/live';
    
    try {
      ws.current = new WebSocket(url);
    } catch (e) {
      console.error('WebSocket connection error:', e);
      setConnectionStatus('error');
      scheduleReconnect();
      return;
    }

    ws.current.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttempts.current = 0; // Reset attempts on successful connection
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Process different message types defined in the backend contract
        if (data.type === 'frame_update' || data.type === 'alert' || data.type === 'weather_alert') {
          
          // 1. Update zone risks if present in the message payload
          if (data.risk_data && data.risk_data.zones) {
            setActiveZoneRisks(data.risk_data.zones);
          }
          
          // 2. Handle specific alerts and recommendations
          if (data.alert) {
            addAlert(data.alert);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.current.onclose = () => {
      setConnectionStatus('disconnected');
      scheduleReconnect();
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      // onerror is usually followed by onclose, which will handle the actual reconnect schedule
    };
  }, [setConnectionStatus, setActiveZoneRisks, addAlert]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      window.clearTimeout(reconnectTimeout.current);
    }
    
    // Forgiving exponential backoff for mobile network resilience: 
    // Starts at 1s, doubles each time, caps at 15s indefinitely.
    const baseDelay = 1000;
    const maxDelay = 15000;
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts.current), maxDelay);
    
    reconnectAttempts.current += 1;
    
    reconnectTimeout.current = window.setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        // Clean up: prevent reconnect on unmount
        ws.current.onclose = null;
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);
}
