# cv_pipeline / scripts

Will contain the Phase 1 CV pipeline modules:

- `download_weights.py` — fetch YOLO weights on first run.
- `zone_config.py` — configurable zone grid system (`Zone` dataclass, JSON loading).
- `detector.py` — `CrowdDetector` (YOLO person detection + per-zone density).
- `optical_flow.py` — `OpticalFlowAnalyzer` (Farneback dense optical flow).
- `tracker.py` — `CrowdTracker` (ByteTrack IDs + anomaly detection).
- `pipeline.py` — `CVPipeline` orchestrator (batch + stream modes).

**Status:** Scaffolding only — no logic implemented yet.
