# backend / app

FastAPI application source. Contains the entry point (`main.py`), route
handlers, service layer (Supabase client, weather polling, orchestration of the
live processing loop), Pydantic schemas matching the DB tables and the Phase
1/2/3 JSON contracts, and WebSocket connection management.

## Subfolders

| Folder | Purpose |
|---|---|
| `routers/` | REST API route handlers (incidents, simulations, trends, zones, announcements, voice, sentiment, webhooks, video processing). |
| `services/` | Data-access and business-logic services (Supabase client, weather, orchestrator). |
| `models/` | SQL schema (`schema.sql`), Pydantic schemas and DB-mirroring models. |
| `websockets/` | Real-time WebSocket connection manager and `/ws/live` route. |

**Status:** Scaffolding only — no logic implemented yet.
