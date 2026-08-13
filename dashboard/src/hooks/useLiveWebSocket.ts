import { useEffect, useRef, useCallback } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import type { WebSocketFrameMessage } from '../types/api';

const INITIAL_BACKOFF_MS = 1000; // 1s
const MAX_BACKOFF_MS = 10000;    // 10s

/**
 * Custom React Hook to manage real-time WebSocket connection to CrowdShield backend.
 * Features auto-reconnect with exponential backoff (1s -> 10s max) and cleans up on unmount.
 */
export const useLiveWebSocket = () => {
  const setConnectionStatus = useLiveDataStore((state) => state.setConnectionStatus);
  const processWebSocketMessage = useLiveDataStore((state) => state.processWebSocketMessage);
  const connectionStatus = useLiveDataStore((state) => state.connectionStatus);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef<number>(INITIAL_BACKOFF_MS);
  const isMountedRef = useRef<boolean>(true);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear any existing reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close any previous socket connection
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onerror = null;
      socketRef.current.onclose = null;
      if (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close();
      }
      socketRef.current = null;
    }

    setConnectionStatus('connecting');

    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8000/ws/live';
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;
    } catch (err) {
      console.error('[useLiveWebSocket] Failed to instantiate WebSocket:', err);
      setConnectionStatus('error');
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (!isMountedRef.current) return;
      console.log(`[useLiveWebSocket] Connected successfully to ${wsUrl}`);
      setConnectionStatus('connected');
      backoffDelayRef.current = INITIAL_BACKOFF_MS; // Reset backoff delay on clean connection
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;
      try {
        const data: WebSocketFrameMessage = JSON.parse(event.data);
        processWebSocketMessage(data);
      } catch (err) {
        console.error('[useLiveWebSocket] Error parsing WebSocket message JSON:', err, event.data);
      }
    };

    socket.onerror = (event: Event) => {
      if (!isMountedRef.current) return;
      console.warn('[useLiveWebSocket] WebSocket error event encountered:', event);
      setConnectionStatus('error');
    };

    socket.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current) return;
      console.log(`[useLiveWebSocket] WebSocket closed (code: ${event.code}). Reconnecting...`);
      setConnectionStatus('disconnected');
      socketRef.current = null;
      scheduleReconnect();
    };
  }, [setConnectionStatus, processWebSocketMessage]);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = backoffDelayRef.current;
    console.log(`[useLiveWebSocket] Scheduling reconnect in ${delay}ms...`);

    // Exponential increase capped at MAX_BACKOFF_MS (10s)
    backoffDelayRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onerror = null;
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return {
    connectionStatus,
    reconnect: connect,
  };
};

export default useLiveWebSocket;
