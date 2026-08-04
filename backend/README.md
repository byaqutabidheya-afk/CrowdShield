# backend

FastAPI orchestration layer (Phase 4) that wires the three AI/ML pipelines
(`ai-core`) into a single continuously-running system: persistent Supabase
storage, REST endpoints, WebSocket real-time streaming, and external
integrations (weather, voice, announcements).

## Subfolders

| Folder | Purpose |
|---|---|
| `app/` | FastAPI application source. |
| `tests/` | Backend unit/integration tests (pytest + FastAPI TestClient with mocked services). |

**Status:** Scaffolding only — no logic implemented yet.
