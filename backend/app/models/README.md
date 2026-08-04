# backend / app / models

Data models and schemas:

- `schema.sql` — Postgres DDL for the 5 Supabase tables (zones, crowd_metrics, risk_alerts, incident_reports, interventions), run in the Supabase SQL editor.
- `schemas.py` — Pydantic models mirroring every DB table plus the exact Phase 1, Phase 2, and Phase 3 JSON output contracts.

**Status:** Scaffolding only — no logic implemented yet.
