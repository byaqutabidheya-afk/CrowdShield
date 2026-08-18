import { useEffect, useRef, useCallback } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import type { WebSocketFrameMessage } from '../types/api';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

/**
 * Custom React Hook to manage real-time WebSocket connection to CrowdShield backend.
 */
export const useLiveWebSocket = () => {
  const setConnectionStatus = useLiveDataStore((state) => state.setConnectionStatus);
  const processWebSocketMessage = useLiveDataStore((state) => state.processWebSocketMessage);
  const connectionStatus = useLiveDataStore((state) => state.connectionStatus);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef<number>(INITIAL_BACKOFF_MS);
  const isMountedRef = useRef<boolean>(false);

  // Keep store actions in refs so callbacks always call the latest version
  const setConnectionStatusRef = useRef(setConnectionStatus);
  const processWebSocketMessageRef = useRef(processWebSocketMessage);
  useEffect(() => { setConnectionStatusRef.current = setConnectionStatus; }, [setConnectionStatus]);
  useEffect(() => { processWebSocketMessageRef.current = processWebSocketMessage; }, [processWebSocketMessage]);

  const cleanupSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      const old = socketRef.current;
      socketRef.current = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
          old.close();
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const getWsUrl = useCallback(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname || '127.0.0.1';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${host}:8000/ws/live`;
    }
    return import.meta.env.VITE_BACKEND_WS_URL || 'ws://127.0.0.1:8000/ws/live';
  }, []);

  // Forward ref for reconnect scheduler
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const connect = useCallback((force: boolean = false) => {
    if (!isMountedRef.current) return;

    if (!force && socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        setConnectionStatusRef.current('connected');
        return;
      }
      if (socketRef.current.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    cleanupSocket();
    setConnectionStatusRef.current('connecting');

    const wsUrl = getWsUrl();
    console.log(`[useLiveWebSocket] Attempting WebSocket connection to ${wsUrl}...`);

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;
    } catch (err) {
      console.error('[useLiveWebSocket] Failed to create WebSocket:', err);
      setConnectionStatusRef.current('error');
      scheduleReconnectRef.current();
      return;
    }

    socket.onopen = () => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.log(`[useLiveWebSocket] Successfully connected to ${wsUrl}`);
      setConnectionStatusRef.current('connected');
      backoffDelayRef.current = INITIAL_BACKOFF_MS;
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      try {
        const data: WebSocketFrameMessage = JSON.parse(event.data);
        processWebSocketMessageRef.current(data);
      } catch (err) {
        console.error('[useLiveWebSocket] Failed to parse message:', err, event.data);
      }
    };

    socket.onerror = (err) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.warn('[useLiveWebSocket] WebSocket error encountered:', err);
      setConnectionStatusRef.current('error');
    };

    socket.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current || socketRef.current !== socket) return;
      console.log(`[useLiveWebSocket] Closed (code ${event.code}). Reconnecting in ${backoffDelayRef.current}ms...`);
      setConnectionStatusRef.current('disconnected');
      socketRef.current = null;
      scheduleReconnectRef.current();
    };
  }, [cleanupSocket, getWsUrl]);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    const delay = backoffDelayRef.current;
    backoffDelayRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connect(true);
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  // Mount effect: connect on mount, cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      cleanupSocket();
    };
  }, [connect, cleanupSocket]);

  const reconnect = useCallback(() => {
    backoffDelayRef.current = INITIAL_BACKOFF_MS;
    connect(true);
  }, [connect]);

  return { connectionStatus, reconnect };
};

export default useLiveWebSocket;
