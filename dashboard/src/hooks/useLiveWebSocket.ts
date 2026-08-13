import { useEffect, useRef, useCallback } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import type { WebSocketFrameMessage } from '../types/api';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

/**
 * Custom React Hook to manage real-time WebSocket connection to CrowdShield backend.
 * Uses refs for all mutable state to eliminate stale closure bugs that prevented
 * onopen from ever firing setConnectionStatus('connected').
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
  // without needing them as useCallback / useEffect dependencies.
  const setConnectionStatusRef = useRef(setConnectionStatus);
  const processWebSocketMessageRef = useRef(processWebSocketMessage);
  useEffect(() => { setConnectionStatusRef.current = setConnectionStatus; }, [setConnectionStatus]);
  useEffect(() => { processWebSocketMessageRef.current = processWebSocketMessage; }, [processWebSocketMessage]);

  // Forward-declared via ref so connect() and scheduleReconnect() can reference
  // each other without circular dependency array issues.
  const connectRef = useRef<(force?: boolean) => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const cleanupSocket = useCallback(() => {
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

  // Define connect and scheduleReconnect as plain functions stored in refs.
  // This means they always see the latest values of each other and of isMountedRef
  // without any dependency arrays — completely eliminating stale closures.
  useEffect(() => {
    scheduleReconnectRef.current = () => {
      if (!isMountedRef.current) return;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      const delay = backoffDelayRef.current;
      backoffDelayRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connectRef.current(true);
        }
      }, delay);
    };

    connectRef.current = (force: boolean = false) => {
      if (!isMountedRef.current) return;

      // Skip if already open/connecting and not forced
      if (!force && socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN) {
          setConnectionStatusRef.current('connected');
          return;
        }
        if (socketRef.current.readyState === WebSocket.CONNECTING) {
          return;
        }
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      cleanupSocket();
      setConnectionStatusRef.current('connecting');

      const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8000/ws/live';

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
        // Guard: discard events from a socket that was replaced
        if (!isMountedRef.current || socketRef.current !== socket) return;
        console.log(`[useLiveWebSocket] Connected to ${wsUrl}`);
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

      socket.onerror = () => {
        if (!isMountedRef.current || socketRef.current !== socket) return;
        setConnectionStatusRef.current('error');
      };

      socket.onclose = (event: CloseEvent) => {
        if (!isMountedRef.current || socketRef.current !== socket) return;
        console.log(`[useLiveWebSocket] Closed (code ${event.code}). Reconnecting...`);
        setConnectionStatusRef.current('disconnected');
        socketRef.current = null;
        scheduleReconnectRef.current();
      };
    };
  }); // no dependency array — runs after every render to keep refs fresh

  // Mount / unmount effect — runs exactly once
  useEffect(() => {
    isMountedRef.current = true;
    connectRef.current();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      cleanupSocket();
    };
  }, [cleanupSocket]); // cleanupSocket is stable (empty deps useCallback)

  const reconnect = useCallback(() => {
    backoffDelayRef.current = INITIAL_BACKOFF_MS;
    connectRef.current(true);
  }, []);

  return { connectionStatus, reconnect };
};

export default useLiveWebSocket;
