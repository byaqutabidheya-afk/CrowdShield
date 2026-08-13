import { useEffect, useRef, useCallback } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import type { WebSocketFrameMessage } from '../types/api';

const INITIAL_BACKOFF_MS = 1000; // 1s
const MAX_BACKOFF_MS = 10000;    // 10s

/**
 * Custom React Hook to manage real-time WebSocket connection to CrowdShield backend.
 * Features auto-reconnect with exponential backoff (1s -> 10s max) and clean mounting/unmounting.
 */
export const useLiveWebSocket = () => {
  const setConnectionStatus = useLiveDataStore((state) => state.setConnectionStatus);
  const processWebSocketMessage = useLiveDataStore((state) => state.processWebSocketMessage);
  const connectionStatus = useLiveDataStore((state) => state.connectionStatus);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef<number>(INITIAL_BACKOFF_MS);
  const isMountedRef = useRef<boolean>(true);

  // Clean up and strip event listeners from any active or previous socket
  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      const oldSocket = socketRef.current;
      socketRef.current = null;
      oldSocket.onopen = null;
      oldSocket.onmessage = null;
      oldSocket.onerror = null;
      oldSocket.onclose = null;
      try {
        if (oldSocket.readyState === WebSocket.OPEN || oldSocket.readyState === WebSocket.CONNECTING) {
          oldSocket.close();
        }
      } catch (e) {
        // Ignore close errors during teardown
      }
    }
  }, []);

  const connect = useCallback((force: boolean = false) => {
    if (!isMountedRef.current) return;

    // If socket is already OPEN or CONNECTING, do not recreate unless forced
    if (!force && socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        setConnectionStatus('connected');
        return;
      }
      if (socketRef.current.readyState === WebSocket.CONNECTING) {
        setConnectionStatus('connecting');
        return;
      }
    }

    // Clear any pending reconnect timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up previous socket completely
    cleanupSocket();

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
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.log(`[useLiveWebSocket] Connected successfully to ${wsUrl}`);
      setConnectionStatus('connected');
      backoffDelayRef.current = INITIAL_BACKOFF_MS;
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      try {
        const data: WebSocketFrameMessage = JSON.parse(event.data);
        processWebSocketMessage(data);
      } catch (err) {
        console.error('[useLiveWebSocket] Error parsing WebSocket message JSON:', err, event.data);
      }
    };

    socket.onerror = (event: Event) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.warn('[useLiveWebSocket] WebSocket error event encountered:', event);
      setConnectionStatus('error');
    };

    socket.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.log(`[useLiveWebSocket] WebSocket closed (code: ${event.code}). Reconnecting...`);
      setConnectionStatus('disconnected');
      socketRef.current = null;
      scheduleReconnect();
    };
  }, [setConnectionStatus, processWebSocketMessage, cleanupSocket]);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = backoffDelayRef.current;
    console.log(`[useLiveWebSocket] Scheduling reconnect in ${delay}ms...`);

    backoffDelayRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connect(true);
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

      cleanupSocket();
    };
  }, [connect, cleanupSocket]);

  return {
    connectionStatus,
    reconnect: () => connect(true),
  };
};

export default useLiveWebSocket;
