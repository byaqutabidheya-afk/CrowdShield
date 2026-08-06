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

    MIN_REVERSE_VELOCITY: float = 0.8
    BOTTLENECK_REVERSE_VELOCITY: float = 1.5
    COSINE_SIMILARITY_THRESHOLD: float = -0.6
    REVERSE_PERSISTENCE_FRAMES: int = 5
    REVERSE_MIN_TRACKLETS: int = 2

    BOTTLENECK_STALL_SPEED: float = 0.01
    BOTTLENECK_PREVIOUS_SPEED: float = 0.02
    BOTTLENECK_FLOW_CONTRAST: float = 0.01
    BOTTLENECK_SPEED_DROP_RATIO: float = 0.5

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
        self._zone_bottleneck_state: dict[str, bool] = {}
        self._zone_reverse_flow_history: dict[str, deque[set[int]]] = {}
        self._frame_counter: int = 0

    def _reset_anomaly_state(self) -> None:
        self._zone_bottleneck_state.clear()
        self._zone_reverse_flow_history.clear()
        self._frame_counter = 0

    def track_frame(self, frame: np.ndarray) -> list[dict[str, Any]]:
        """Track detections in a frame and return persistent track IDs."""

        if frame is None:
            raise ValueError("frame must not be None.")

        if not self.frame_history:
            self._reset_anomaly_state()

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
        self._frame_counter += 1

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

        if int(current_crowd_count or 0) == 0:
            self._zone_bottleneck_state[zone_id] = False
            self._zone_reverse_flow_history[zone_id] = deque(maxlen=self.REVERSE_PERSISTENCE_FRAMES)
            return {
                "reverse_flow_detected": False,
                "erratic_movement_flag": False,
                "bottleneck_detected": False,
                "anomaly_flags": [],
            }

        bottleneck_detected = self._detect_bottleneck(zone_id, history)
        self._zone_bottleneck_state[zone_id] = bottleneck_detected

        reverse_flow_detected = self._detect_reverse_flow(
            tracks_in_zone, zone_flow_direction_deg, zone_id
        )
        erratic_movement_flag = self._detect_erratic_movement(tracks_in_zone)

        anomaly_flags: list[str] = []
        if reverse_flow_detected:
            anomaly_flags.append("reverse_flow")
        if erratic_movement_flag:
            anomaly_flags.append("erratic_movement")
        if bottleneck_detected:
            anomaly_flags.append("bottleneck")

        if self._frame_counter % 10 == 0:
            self._log_diagnostics(zone_id, tracks_in_zone, zone_flow_direction_deg, history)

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
        zone_id: str,
    ) -> bool:
        if not tracks_in_zone:
            self._zone_reverse_flow_history[zone_id] = deque(maxlen=self.REVERSE_PERSISTENCE_FRAMES)
            return False

        corridor_rad = math.radians(zone_flow_direction_deg)
        corridor_vec = (math.sin(corridor_rad), -math.cos(corridor_rad))

        velocity_threshold = self.MIN_REVERSE_VELOCITY

        current_reverse_tracklets: set[int] = set()

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

            consistent_reverse = True
            for previous, current in zip(
                smoothed_history[-4:], smoothed_history[-4:][1:], strict=False
            ):
                dx = current[0] - previous[0]
                dy = current[1] - previous[1]
                speed = _segment_speed(dx, dy)

                if speed < velocity_threshold:
                    consistent_reverse = False
                    break

                v_mag = speed
                dot_product = dx * corridor_vec[0] + dy * corridor_vec[1]
                cos_theta = dot_product / (v_mag * math.hypot(corridor_vec[0], corridor_vec[1]))

                if cos_theta >= self.COSINE_SIMILARITY_THRESHOLD:
                    consistent_reverse = False
                    break

            if consistent_reverse:
                current_reverse_tracklets.add(int(track_id))

        if zone_id not in self._zone_reverse_flow_history:
            self._zone_reverse_flow_history[zone_id] = deque(maxlen=self.REVERSE_PERSISTENCE_FRAMES)

        self._zone_reverse_flow_history[zone_id].append(current_reverse_tracklets)

        if len(self._zone_reverse_flow_history[zone_id]) < self.REVERSE_PERSISTENCE_FRAMES:
            return False

        persistent_tracklets: set[int] = set.intersection(
            *self._zone_reverse_flow_history[zone_id]
        )

        return len(persistent_tracklets) >= self.REVERSE_MIN_TRACKLETS

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

        if float(rolling_speed) <= 0.0:
            return False

        local_density_high = float(current_density_score) >= self.min_bottleneck_density
        crowd_not_decreasing = int(current_crowd_count) >= int(previous_crowd_count)

        if not (local_density_high and crowd_not_decreasing):
            return False

        speed_drop_ratio = 1.0 - (float(current_speed) / float(rolling_speed))
        return speed_drop_ratio > self.BOTTLENECK_SPEED_DROP_RATIO

    def _log_diagnostics(
        self,
        zone_id: str,
        tracks_in_zone: list[dict[str, Any]],
        zone_flow_direction_deg: float,
        history: dict[str, Any],
    ) -> None:
        zone_history = history.get(zone_id, {}) if isinstance(history, dict) else {}
        current_speed = zone_history.get("current_flow_speed", 0.0)
        current_crowd_count = zone_history.get("current_crowd_count", 0)
        current_density = zone_history.get("current_density_score", 0.0)

        opposing_vectors = 0
        if tracks_in_zone:
            corridor_rad = math.radians(zone_flow_direction_deg)
            corridor_vec = (math.sin(corridor_rad), -math.cos(corridor_rad))
            for track in tracks_in_zone:
                track_id = track.get("track_id")
                if track_id is None:
                    continue
                hist = self.track_history.get(int(track_id), deque())
                if len(hist) >= 2:
                    dx = hist[-1][0] - hist[-2][0]
                    dy = hist[-1][1] - hist[-2][1]
                    speed = _segment_speed(dx, dy)
                    if speed >= self.MIN_REVERSE_VELOCITY:
                        v_mag = speed
                        dot_product = dx * corridor_vec[0] + dy * corridor_vec[1]
                        cos_theta = dot_product / (v_mag * math.hypot(corridor_vec[0], corridor_vec[1]))
                        if cos_theta < self.COSINE_SIMILARITY_THRESHOLD:
                            opposing_vectors += 1

        print(
            f"[DIAG] Frame={self._frame_counter} Zone={zone_id} "
            f"Tracks={current_crowd_count} Density={current_density:.3f} "
            f"MeanVel={current_speed:.3f} Opposing={opposing_vectors}"
        )
