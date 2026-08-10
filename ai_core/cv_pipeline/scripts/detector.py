"""Person detection and zone assignment for the CrowdShield CV pipeline."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np


CURRENT_DIR = Path(__file__).resolve().parent
CV_PIPELINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = CV_PIPELINE_DIR.parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))
if str(CV_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(CV_PIPELINE_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

try:
    from ai_core.cv_pipeline.models.download_weights import download_yolov8n_weights
    from ai_core.shared.zone_config import Zone
except ImportError:
    from models.download_weights import download_yolov8n_weights
    from shared.zone_config import Zone


def _point_in_bounds(
    x: float,
    y: float,
    bounds_normalized: dict[str, float],
    *,
    include_upper: bool = False,
) -> bool:
    x_min = float(bounds_normalized["x_min"])
    y_min = float(bounds_normalized["y_min"])
    x_max = float(bounds_normalized["x_max"])
    y_max = float(bounds_normalized["y_max"])

    if include_upper:
        within_x = x_min <= x <= x_max
        within_y = y_min <= y <= y_max
    else:
        within_x = x_min <= x < x_max
        within_y = y_min <= y < y_max

    return within_x and within_y


class CrowdDetector:
    """YOLOv8n-based crowd detector focused on COCO person detections."""

    def __init__(self, model_path: Path | str | None = None) -> None:
        model_path = (
            Path(model_path) if model_path is not None else download_yolov8n_weights()
        )

        try:
            from ultralytics import YOLO
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise RuntimeError(
                "Ultralytics is required for CrowdDetector. Install the package before using it."
            ) from exc

        self.model_path = model_path
        self.model = YOLO(str(model_path))

    def detect_frame(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """Run YOLO detection on a frame and return person detections only."""

        if frame is None:
            raise ValueError("frame must not be None.")

        results = self.model.predict(frame, verbose=False)
        detections: list[dict[str, Any]] = []

        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue

            xyxy = (
                boxes.xyxy.cpu().numpy()
                if hasattr(boxes.xyxy, "cpu")
                else np.asarray(boxes.xyxy)
            )
            confs = (
                boxes.conf.cpu().numpy()
                if hasattr(boxes.conf, "cpu")
                else np.asarray(boxes.conf)
            )
            classes = (
                boxes.cls.cpu().numpy()
                if hasattr(boxes.cls, "cpu")
                else np.asarray(boxes.cls)
            )

            for box, confidence, class_id in zip(xyxy, confs, classes, strict=False):
                if int(class_id) != 0:
                    continue

                x1, y1, x2, y2 = (float(value) for value in box)
                center_x = (x1 + x2) / 2.0
                center_y = (y1 + y2) / 2.0
                detections.append(
                    {
                        "bbox": (x1, y1, x2, y2),
                        "confidence": float(confidence),
                        "center": (center_x, center_y),
                        "class_id": 0,
                    }
                )

        return detections

    def assign_to_zones(
        self,
        detections: list[dict[str, Any]],
        zones: list[Zone],
        frame_width: int,
        frame_height: int,
    ) -> dict[str, list[dict[str, Any]]]:
        """Assign detections to the zone(s) containing their center point."""

        if frame_width <= 0 or frame_height <= 0:
            raise ValueError(
                "frame_width and frame_height must both be greater than zero."
            )

        assignments: dict[str, list[dict[str, Any]]] = {
            zone.zone_id: [] for zone in zones
        }

        for detection in detections:
            center_x, center_y = detection["center"]
            normalized_x = float(center_x) / float(frame_width)
            normalized_y = float(center_y) / float(frame_height)

            for zone_index, zone in enumerate(zones):
                include_upper = (
                    zone.bounds_normalized["x_max"] == 1.0
                    or zone.bounds_normalized["y_max"] == 1.0
                )
                if _point_in_bounds(
                    normalized_x,
                    normalized_y,
                    zone.bounds_normalized,
                    include_upper=include_upper,
                ):
                    assignments[zone.zone_id].append(detection)

        return assignments

    def compute_density(
        self, detections_in_zone: list[dict[str, Any]], zone: Zone
    ) -> float:
        """Normalize the number of detections in a zone to a 0-1 density."""

        count = len(detections_in_zone)
        return min(count / float(zone.max_expected_count), 1.0)
