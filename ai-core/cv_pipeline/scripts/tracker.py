"""Tracking and anomaly detection for the CrowdShield CV pipeline."""

from __future__ import annotations

import math
import sys
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np


CURRENT_DIR = Path(__file__).resolve().parent
CV_PIPELINE_DIR = CURRENT_DIR.parent
if str(CV_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(CV_PIPELINE_DIR))

from models.download_weights import download_yolov8n_weights


def _angle_difference_degrees(first: float, second: float) -> float:
    """Return the smallest absolute difference between two headings."""

    delta = abs((first - second + 180.0) % 360.0 - 180.0)
    return delta


def _vector_heading_degrees(dx: float, dy: float) -> float:
    """Convert a screen-space movement vector into a compass heading in degrees."""

    return (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0


def _smoothed_positions(
    history: list[tuple[float, float]], window_size: int = 3
) -> list[tuple[float, float]]:
    """Return a simple moving-average trajectory to damp track jitter."""

    if len(history) < window_size:
        return []

    smoothed_history: list[tuple[float, float]] = []
    window_count = len(history) - window_size + 1
    for start_index in range(window_count):
        window = history[start_index : start_index + window_size]
        x_values = [point[0] for point in window]
        y_values = [point[1] for point in window]
        smoothed_history.append(
            (sum(x_values) / window_size, sum(y_values) / window_size)
        )

    return smoothed_history


def _segment_speed(dx: float, dy: float) -> float:
    return math.hypot(dx, dy)


class CrowdTracker:
    """ByteTrack-backed tracker with rolling motion history and anomaly flags."""

    min_directional_speed: float = 0.15
    min_bottleneck_density: float = 0.01
    max_bottleneck_crowd_count: int = 2

    def __init__(self, model_path: Path | str | None = None) -> None:
        model_path = (
            Path(model_path) if model_path is not None else download_yolov8n_weights()
        )

        try:
            from ultralytics import YOLO
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise RuntimeError(
                "Ultralytics is required for CrowdTracker. Install the package before using it."
            ) from exc

        self.model_path = model_path
        self.model = YOLO(str(model_path))
        self.track_history: dict[int, deque[tuple[float, float]]] = {}
        self.frame_history: deque[dict[int, tuple[float, float]]] = deque(maxlen=30)

    def track_frame(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """Track detections in a frame and return persistent track IDs."""

        if frame is None:
            raise ValueError("frame must not be None.")

        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
        )

        tracked_objects: list[dict[str, Any]] = []
        frame_positions: dict[int, tuple[float, float]] = {}

        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None or boxes.id is None:
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
            track_ids = (
                boxes.id.cpu().numpy()
                if hasattr(boxes.id, "cpu")
                else np.asarray(boxes.id)
            )

            for box, confidence, class_id, track_id in zip(
                xyxy, confs, classes, track_ids, strict=False
            ):
                if int(class_id) != 0:
                    continue

                x1, y1, x2, y2 = (float(value) for value in box)
                center_x = (x1 + x2) / 2.0
                center_y = (y1 + y2) / 2.0
                persistent_track_id = int(track_id)

                tracked_objects.append(
                    {
                        "track_id": persistent_track_id,
                        "bbox": (x1, y1, x2, y2),
                        "confidence": float(confidence),
                        "center": (center_x, center_y),
                        "class_id": 0,
                    }
                )

                track_history = self.track_history.setdefault(
                    persistent_track_id, deque(maxlen=30)
                )
                track_history.append((center_x, center_y))
                frame_positions[persistent_track_id] = (center_x, center_y)

        self.frame_history.append(frame_positions)
        return tracked_objects

    def detect_anomalies(
        self,
        zone_id: str,
        tracks_in_zone: list[dict[str, Any]],
        zone_flow_direction_deg: float,
        history: dict[str, Any],
    ) -> dict[str, Any]:
        """Detect reverse flow, erratic movement, and bottleneck patterns."""

        zone_history = history.get(zone_id, {}) if isinstance(history, dict) else {}
        current_crowd_count = (
            zone_history.get("current_crowd_count")
            if isinstance(zone_history, dict)
            else None
        )
        current_flow_speed = (
            zone_history.get("current_flow_speed")
            if isinstance(zone_history, dict)
            else None
        )

        # Empty zones can still carry small optical-flow noise and stale rolling
        # history, which is enough to satisfy the bottleneck comparison unless we
        # short-circuit first. We never score anomalies when the zone has no people.
        if int(current_crowd_count or 0) == 0:
            return {
                "reverse_flow_detected": False,
                "erratic_movement_flag": False,
                "bottleneck_detected": False,
                "anomaly_flags": [],
            }

        reverse_flow_detected = self._detect_reverse_flow(
            tracks_in_zone, zone_flow_direction_deg
        )
        erratic_movement_flag = self._detect_erratic_movement(tracks_in_zone)
        bottleneck_detected = self._detect_bottleneck(zone_id, history)

        anomaly_flags: list[str] = []
        if reverse_flow_detected:
            anomaly_flags.append("reverse_flow")
        if erratic_movement_flag:
            anomaly_flags.append("erratic_movement")
        if bottleneck_detected:
            anomaly_flags.append("bottleneck")

        return {
            "reverse_flow_detected": reverse_flow_detected,
            "erratic_movement_flag": erratic_movement_flag,
            "bottleneck_detected": bottleneck_detected,
            "anomaly_flags": anomaly_flags,
        }

    def _detect_reverse_flow(
        self,
        tracks_in_zone: list[dict[str, Any]],
        zone_flow_direction_deg: float,
    ) -> bool:
        if not tracks_in_zone:
            return False

        reverse_count = 0
        evaluated_count = 0

        current_flow_speed = None
        for track in tracks_in_zone:
            track_id = track.get("track_id")
            if track_id is None:
                continue

            history = self.track_history.get(int(track_id), deque())
            if len(history) < 2:
                continue

            zone_candidate_speed = _segment_speed(
                history[-1][0] - history[-2][0], history[-1][1] - history[-2][1]
            )
            if current_flow_speed is None or zone_candidate_speed > current_flow_speed:
                current_flow_speed = zone_candidate_speed

        if (
            current_flow_speed is None
            or float(current_flow_speed) < self.min_directional_speed
        ):
            return False

        for track in tracks_in_zone:
            track_id = track.get("track_id")
            if track_id is None:
                continue

            history = self.track_history.get(int(track_id), deque())
            if len(history) < 4:
                continue

            smoothed_history = _smoothed_positions(list(history)[-6:], window_size=3)
            if len(smoothed_history) < 3:
                continue

            recent_vectors: list[tuple[float, float]] = []
            for previous, current in zip(
                smoothed_history[-4:], smoothed_history[-4:][1:], strict=False
            ):
                dx = current[0] - previous[0]
                dy = current[1] - previous[1]
                speed = _segment_speed(dx, dy)
                if speed < self.min_directional_speed:
                    continue
                recent_vectors.append((speed, _vector_heading_degrees(dx, dy)))

            if len(recent_vectors) < 3:
                continue

            headings = [heading for _, heading in recent_vectors[-3:]]
            max_heading_spread = max(
                _angle_difference_degrees(headings[0], headings[1]),
                _angle_difference_degrees(headings[1], headings[2]),
                _angle_difference_degrees(headings[0], headings[2]),
            )
            if max_heading_spread > 45.0:
                continue

            evaluated_count += 1
            if all(
                _angle_difference_degrees(heading, zone_flow_direction_deg) > 135.0
                for heading in headings
            ):
                reverse_count += 1

        if evaluated_count == 0:
            return False

        return (reverse_count / evaluated_count) > 0.4

    def _detect_erratic_movement(self, tracks_in_zone: list[dict[str, Any]]) -> bool:
        for track in tracks_in_zone:
            track_id = track.get("track_id")
            if track_id is None:
                continue

            history = list(self.track_history.get(int(track_id), deque()))[-10:]
            if len(history) < 6:
                continue

            smoothed_history = _smoothed_positions(history, window_size=3)
            if len(smoothed_history) < 4:
                continue

            headings: list[float] = []
            for previous, current in zip(
                smoothed_history, smoothed_history[1:], strict=False
            ):
                dx = current[0] - previous[0]
                dy = current[1] - previous[1]
                if dx == 0.0 and dy == 0.0:
                    continue
                headings.append(_vector_heading_degrees(dx, dy))

            if len(headings) < 4:
                continue

            consecutive_large_changes = 0
            for first_heading, second_heading in zip(
                headings, headings[1:], strict=False
            ):
                if _angle_difference_degrees(first_heading, second_heading) > 120.0:
                    consecutive_large_changes += 1
                    if consecutive_large_changes >= 4:
                        return True
                else:
                    consecutive_large_changes = 0

        return False

    def _detect_bottleneck(self, zone_id: str, history: dict[str, Any]) -> bool:
        zone_history = history.get(zone_id, {}) if isinstance(history, dict) else {}
        if not isinstance(zone_history, dict):
            return False

        current_speed = zone_history.get("current_flow_speed")
        rolling_speed = zone_history.get("rolling_avg_flow_speed")
        previous_speed = zone_history.get("previous_flow_speed")
        current_crowd_count = zone_history.get("current_crowd_count")
        previous_crowd_count = zone_history.get("previous_crowd_count")
        current_density_score = zone_history.get("current_density_score")
        neighbor_avg_flow_speed = zone_history.get("neighbor_avg_flow_speed")

        if (
            current_speed is None
            or rolling_speed is None
            or previous_speed is None
            or current_crowd_count is None
            or previous_crowd_count is None
            or current_density_score is None
            or neighbor_avg_flow_speed is None
        ):
            return False

        if rolling_speed <= 0:
            return False

        # Surge footage shows a fast approach followed by an almost complete
        # stop at the choke point. Use that sharp drop as the bottleneck signal,
        # but only when the zone is slower than its adjacent cells.
        sustained_stall = (
            float(current_speed) <= 0.0015 and float(previous_speed) >= 0.05
        )
        local_flow_contrast = (
            float(neighbor_avg_flow_speed) - float(current_speed) >= 0.03
        )
        crowding_signal = int(
            current_crowd_count
        ) <= self.max_bottleneck_crowd_count and (
            float(current_density_score) >= self.min_bottleneck_density
            or float(current_speed) <= 0.0015
        )
        if not (sustained_stall and crowding_signal and local_flow_contrast):
            return False

        speed_drop_ratio = 1.0 - (float(current_speed) / float(rolling_speed))
        crowd_not_decreasing = int(current_crowd_count) >= int(previous_crowd_count)
        return speed_drop_ratio > 0.6 and crowd_not_decreasing
