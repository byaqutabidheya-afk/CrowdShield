# mobile / src

React Native (Expo) source for the citizen app. Will include:

- `screens/` — Alerts, Safe Map, Report Incident, Settings.
- `store/appStore.ts` — zustand store (location, zone risks, language, alerts).
- `hooks/useLiveWebSocket.ts` — WebSocket hook with mobile-friendly reconnect.
- `services/` — geofencing, notifications (FCM), routing.
- `i18n/` — translations for EN, HI, TA, TE, BN, MR.

**Status:** Scaffolding only — no logic implemented yet.
