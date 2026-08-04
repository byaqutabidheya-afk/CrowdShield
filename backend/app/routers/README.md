# backend / app / routers

FastAPI route handlers for the CrowdShield REST API:

- `incidents.py` — `GET/POST /api/incidents` (citizen + AI incident reports).
- `simulations.py` — `POST /api/simulations/pre-event` (phase 2 stress tests).
- `trends.py` — `GET /api/trends/{zone_id}` (historical analytics).
- `zones.py` — `GET/POST /api/zones`, `GET /api/routes` (venue config + blockage predictions).
- `announcements.py` — `POST /api/announcements` (multilingual broadcast + social).
- `voice.py` — `POST /api/voice-command` (audio upload → intent).
- `sentiment.py` — `GET /api/sentiment` (mocked social unrest score).
- `webhooks.py` — `POST /api/webhooks/signage` (simulated signage dispatch).
- `video_control.py` — processing start/stop/status endpoints.

**Status:** Scaffolding only — no logic implemented yet.
