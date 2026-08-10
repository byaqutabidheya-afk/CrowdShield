# models

Holds downloaded YOLO model weights (e.g. `yolov8n.pt`).

Weights are large binaries and are **not tracked in git** — see the root
`.gitignore` (`ai_core/cv_pipeline/models/*.pt`). A download script
(`scripts/download_weights.py`) fetches them on first run, or they can be
added via Git LFS.
