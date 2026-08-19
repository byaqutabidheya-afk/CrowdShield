/**
 * Push notification scaffolding for CrowdShield Citizen PWA.
 * Full FCM wiring will be implemented in subsequent phases.
 */

/**
 * Shows an immediate local notification for events derived on the client (e.g., geofencing proximity checks).
 * This is distinct from server-triggered remote push notifications.
 * Uses the ServiceWorker registration if available (more reliable in installed PWAs),
 * falling back to the standard native Notification API otherwise.
 * 
 * @param title - Notification title
 * @param body - Notification body text
 */
import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../firebase';
import axios from 'axios';
import { useAppStore } from '../store/appStore';
import { getBackendHttpUrl } from './apiConfig';

/**
 * Shows an immediate local notification for events derived on the client (e.g., geofencing proximity checks).
 * This is distinct from server-triggered remote push notifications.
 * Uses the ServiceWorker registration if available (more reliable in installed PWAs),
 * falling back to the standard native Notification API otherwise.
 * 
 * @param title - Notification title
 * @param body - Notification body text
 */
export async function showLocalNotification(title: string, body: string): Promise<void> {
  try {
    // Check if browser supports notifications natively
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('This browser does not support local notifications.');
      return;
    }

    // Only proceed if permission has already been granted explicitly
    if (Notification.permission === 'granted') {
      // Attempt to use the active ServiceWorker registration first
      if ('serviceWorker' in navigator) {
        // getRegistration resolves immediately, unlike .ready which may hang if no SW exists
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, {
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png', // Small monochrome icon usually goes here
            // @ts-ignore
            vibrate: [200, 100, 200, 100, 200], // Alert vibration pattern
          });
          return;
        }
      }
      
      // Fallback to the standard window Notification API
      new Notification(title, {
        body,
        icon: '/icons/icon-192x192.png'
      });
    } else {
      console.debug('Local notification suppressed: Notification.permission is not granted.');
    }
  } catch (error) {
    console.error('Failed to display local notification:', error);
  }
}

/**
 * Requests Notification permission and registers for remote push notifications via Firebase.
 */
export async function registerForPush(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission not granted.');
      return null;
    }

    if (!messaging) {
      console.warn('Firebase Messaging not initialized.');
      return null;
    }

    let registration;
    if ('serviceWorker' in navigator) {
      registration = await navigator.serviceWorker.getRegistration();
    }

    const currentToken = await getToken(messaging, { 
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration || undefined
    });

    if (currentToken) {
      console.log('FCM Token received:', currentToken);
      
      const state = useAppStore.getState();
      const location = state.userLocation;
      const deviceId = state.clientDeviceId;
      
      const url = getBackendHttpUrl();
      
      await axios.post(`${url}/devices/register`, {
        device_id: deviceId,
        fcm_token: currentToken,
        last_known_location: location ? { lat: location.lat, lng: location.lng } : null
      });

      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.error('An error occurred while retrieving token. ', err);
    return null;
  }
}

/**
 * Sets up foreground message handling. Browsers do not show a system notification 
 * for pushes that arrive while the tab is actively focused. 
 * We intercept them here and route them into the standard activeAlerts UI pipeline.
 */
export function setupForegroundMessaging() {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('Received foreground message ', payload);
    
    // Route into the WebSocket-delivered activeAlerts UI flow
    const store = useAppStore.getState();
    const title = payload.notification?.title || 'Push Alert';
    const body = payload.notification?.body || 'New broadcast message received.';
    
    // Attempt to map custom data translations if they were attached
    const messagePayload: Record<string, string> = { en: body };
    if (payload.data) {
      Object.keys(payload.data).forEach(key => {
        if (key.startsWith('message_')) {
          const langCode = key.replace('message_', '');
          messagePayload[langCode] = payload.data![key];
        }
      });
    }

    store.addAlert({
      zone_id: payload.data?.zone_id || 'broadcast',
      risk_level: payload.data?.risk_level || 'high',
      timestamp: new Date().toISOString(),
      message: messagePayload,
      recommendations: [] // Fallback if not provided in payload data
    });

    // Optionally show the local toast/banner as well
    showLocalNotification(title, body);
  });
}
