import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';
import type { Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Initialize Cloud Messaging and get a reference to the service
// We wrap this in a try-catch because getMessaging() can throw if the browser 
// does not support the required APIs (e.g., no IndexedDB, ServiceWorkers, etc.)
let messaging: Messaging | null = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging is not supported in this browser environment.", e);
}

export { app, messaging };
