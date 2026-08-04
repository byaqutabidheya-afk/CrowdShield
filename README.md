# CrowdShield

**AI-powered crowd stampede early-warning system.**

CrowdShield is an affordable, AI-first early warning system designed to prevent
crowd stampedes at large public gatherings — festivals, sports venues, religious
events, and regional celebrations. It replaces reactive, manual CCTV monitoring
with predictive public safety:

- **Computer vision** estimates crowd density and movement in real time.
- A **risk-prediction engine** forecasts crowd crushes and panic propagation
  *before* they happen.
- A **generative AI layer** turns risk data into actionable recommendations and
  multilingual public announcements.
- A **command dashboard** (web) and **companion mobile app** (Android/iOS)
  surface this intelligence to authorities and citizens.

## Repository Layout

| Folder | Purpose |
|---|---|
| `ai-core/` | CV pipeline, risk engine, and generative AI / voice pipeline |
| `backend/` | FastAPI orchestrator, REST API, and real-time WebSockets |
| `dashboard/` | React command dashboard (2D map, analytics, 3D digital twin) |
| `mobile/` | React Native citizen app (alerts, safe routing, incident reports) |
| `demo/` | Demo videos, mock data, and run-of-show scripts |
| `docs/` | Build guide and project documentation |

## Getting Started

1. Create a Python virtual environment and install dependencies:
   ```bash
   bash setup_python_env.sh
   ```
2. Copy `.env.example` to `.env` and fill in your API keys.
3. Follow the full build instructions in the
   [Build Guide](docs/Build_Guide.md).

> **Status:** Project scaffolding only. No AI/ML logic has been implemented yet.
