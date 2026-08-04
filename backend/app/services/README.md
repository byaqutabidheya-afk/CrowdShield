# backend / app / services

Service layer for the backend:

- `supabase_client.py` — singleton Supabase client + CRUD helpers (metrics, alerts, incidents, zones, trends).
- `orchestrator.py` — `EventOrchestrator`: central loop chaining CV → Risk → GenAI per frame, alert lifecycle, WebSocket broadcast.
- `weather_service.py` — background OpenWeatherMap polling + adverse-weather risk multiplier.

**Status:** Scaffolding only — no logic implemented yet.
