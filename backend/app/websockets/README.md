# backend / app / websockets

Real-time WebSocket layer:

- `manager.py` — `ConnectionManager` (tracks active connections, broadcasts JSON to all).
- `routes.py` — the `/ws/live` WebSocket route that streams combined Phase 1 + Phase 2 (and as-needed Phase 3) output to connected clients.

**Status:** Scaffolding only — no logic implemented yet.
