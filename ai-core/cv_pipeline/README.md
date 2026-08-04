# cv_pipeline

Computer-vision pipeline (Phase 1) that converts raw video/image feeds into a
structured, per-zone JSON data stream containing crowd count, relative density,
flow speed/direction, and anomaly flags.

## Subfolders

| Folder | Purpose |
|---|---|
| `models/` | Downloaded YOLO model weights (e.g. `yolov8n.pt`), fetched by `models/download_weights.py`. |
| `scripts/` | Detection, optical flow, tracking, zone config, and the main pipeline orchestrator. |
| `sample_videos/` | Sample crowd videos for offline testing of the pipeline. |

**Status:** Scaffolding only — no detection logic implemented yet.
