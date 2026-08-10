# ai_core

The AI/ML engine for **CrowdShield**. Contains three sub-pipelines plus a shared directory:

1. **`cv_pipeline/`** (Phase 1) — Computer vision pipeline: YOLOv8 person detection, BoT-SORT tracking, optical flow crowd speed/direction, density mapping, heatmaps, anomaly detection, zone state extraction.
2. **`risk_engine/`** (Phase 2) — Risk engine: risk scoring per zone, panic diffusion modeling, bottleneck/route blockage prediction, pre-event stampede buildup simulation, emergency resource allocation.
3. **`genai_pipeline/`** (Phase 3) — Generative AI & voice pipeline: Gemini 2.5 Pro incident summaries, recommendation engine, multilingual translation + TTS audio alerts, natural language voice query engine.
4. **`shared/`** — Shared zone definitions, standard schemas (`phase1_output.schema.json`, `phase2_output.schema.json`), and cross-pipeline utilities.

---

## Directory Structure

```
ai_core/
├── cv_pipeline/          # Phase 1: Computer Vision
├── risk_engine/          # Phase 2: Risk Scoring & Physics Simulation
├── genai_pipeline/       # Phase 3: GenAI & Audio Generation
├── shared/               # Cross-pipeline schemas & zone logic
└── README.md
```

## Python Environment

Dependencies for all three pipelines are declared in `setup_python_env.sh` at the project root. Run `bash setup_python_env.sh` to construct the shared virtual environment (location: `ai_core/venv/`).
