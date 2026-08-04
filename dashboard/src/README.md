# dashboard / src

React source for the command dashboard. Will include:

- `store/liveDataStore.ts` — zustand store for live frames, zone history, alerts, connection status.
- `hooks/useLiveWebSocket.ts` — WebSocket hook with auto-reconnect.
- `api/client.ts` — typed axios client for the backend REST API.
- `components/` — live venue map + heatmap, analytics charts, AI intervention panel, external triggers, 3D digital twin.
- `App.tsx` — layout shell and navigation.

**Status:** Scaffolding only — no logic implemented yet.
