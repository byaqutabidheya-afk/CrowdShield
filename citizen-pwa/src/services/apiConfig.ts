/**
 * Dynamic Backend URL configuration for Citizen PWA.
 * Automatically resolves the host IP so mobile phones connected to the same Wi-Fi
 * can seamlessly connect to the backend REST API and live WebSockets.
 */

export function getBackendHttpUrl(): string {
  if (import.meta.env.VITE_BACKEND_HTTP_URL) {
    return import.meta.env.VITE_BACKEND_HTTP_URL;
  }
  if (typeof window !== 'undefined') {
    // If running over HTTPS (e.g. Tunnel) or on port 5174/5173, use Vite proxy /api
    if (window.location.protocol === 'https:' || window.location.port === '5174' || window.location.port === '5173') {
      return '/api';
    }
    const host = window.location.hostname || '127.0.0.1';
    return `http://${host}:8000/api`;
  }
  return 'http://127.0.0.1:8000/api';
}

export function getBackendWsUrl(): string {
  if (import.meta.env.VITE_BACKEND_WS_URL) {
    return import.meta.env.VITE_BACKEND_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    // If running over HTTPS or Vite dev server proxy
    if (isHttps || window.location.port === '5174' || window.location.port === '5173') {
      return `${wsProto}//${window.location.host}/ws/live`;
    }
    const host = window.location.hostname || '127.0.0.1';
    return `ws://${host}:8000/ws/live`;
  }
  return 'ws://127.0.0.1:8000/ws/live';
}

