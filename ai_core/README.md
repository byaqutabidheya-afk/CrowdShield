# ai-core

The AI/ML core of CrowdShield — three coordinated pipelines that turn raw video
and sensor data into structured crowd-safety intelligence and human-actionable
recommendations. No AI/ML logic is implemented here yet; this is a scaffold.

## Subfolders

| Folder | Purpose |
|---|---|
| `cv_pipeline/` | **Phase 1** — Computer vision: YOLO person detection, optical-flow crowd movement analysis, zone density estimation, tracking, and anomaly detection. Outputs structured per-frame/per-zone JSON. |
| `risk_engine/` | **Phase 2** — Risk scoring, panic-diffusion simulation, pre-event stress testing, resource allocation, and route blockage prediction. Consumes `cv_pipeline` output. |
| `genai_pipeline/` | **Phase 3** — Generative AI: tactical recommendations, incident summaries, multilingual translation + TTS, mocked sentiment analysis, and the voice command center (STT + intent matching). |
| `shared/` | Shared JSON schemas, data types, and cross-pipeline utilities (e.g. zone definitions/adjacency) referenced by multiple pipelines. |

## Environment

A dedicated Python virtual environment is created by the root
[`setup_python_env.sh`](../setup_python_env.sh) script
(location: `ai-core/venv/`).
