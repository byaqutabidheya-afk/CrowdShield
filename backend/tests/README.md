# backend / tests

Backend test suite (pytest). Uses FastAPI's `TestClient` with mocked Supabase
and mocked AI-pipeline calls so tests run offline and deterministically,
verifying endpoint status codes and response shapes (including Pydantic 422
validation behavior).

**Status:** Scaffolding only — no tests written yet (placeholder `.gitkeep`).
