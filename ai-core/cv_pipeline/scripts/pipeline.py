"""Main CV pipeline orchestrator for CrowdShield Phase 1."""

from __future__ import annotations

import argparse
import json
from collections import deque
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    import cv2
    import numpy as np
    import ultralytics  # noqa: F401 - imported to validate runtime requirements
except ImportError as exc:  # pragma: no cover - environment-dependent
    raise RuntimeError(
        "CrowdShield CVPipeline requires opencv-python, numpy, and ultralytics. "
        "Install those packages in the active environment before running pipeline.py."
    ) from exc

from detector import CrowdDetector
from optical_flow import OpticalFlowAnalyzer
from tracker import CrowdTracker
from zone_config import Zone, generate_grid_zones, load_zones_from_json

DEFAULT_SOURCE_ID = "cam_01"
DEFAULT_SAMPLE_EVERY_N_FRAMES = 3
DEFAULT_MODE = "batch"


def _format_utc_timestamp(start_time: datetime, frame_number: int, fps: float) -> str:
    offset_seconds = frame_number / fps if fps > 0 else 0.0
    timestamp = start_time + timedelta(seconds=offset_seconds)
    return timestamp.isoformat().replace("+00:00", "Z")


def _zone_bounds_payload(zone: Zone) -> dict[str, float]:
    return {
        "x_min": float(zone.bounds_normalized["x_min"]),
        "y_min": float(zone.bounds_normalized["y_min"]),
        "x_max": float(zone.bounds_normalized["x_max"]),
        "y_max": float(zone.bounds_normalized["y_max"]),
    }


def _parse_grid_position(zone_id: str) -> tuple[int, int] | None:
    if not zone_id.startswith("zone_"):
        return None

    suffix = zone_id[5:]
    row_part = ""
    col_part = ""
    for character in suffix:
        if character.isalpha() and not col_part:
            row_part += character.upper()
        elif character.isdigit():
            col_part += character
        else:
            return None

    if not row_part or not col_part:
        return None

    row_index = 0
    for character in row_part:
        row_index = row_index * 26 + (ord(character) - ord("A") + 1)
    row_index -= 1
    col_index = int(col_part) - 1
    return (row_index, col_index) if row_index >= 0 and col_index >= 0 else None


class CVPipeline:
    """Orchestrates detection, tracking, optical flow, and JSON assembly."""

    def __init__(
        self,
        video_path: Path | str,
        zones: list[Zone],
        source_id: str = DEFAULT_SOURCE_ID,
    ) -> None:
        self.video_path = Path(video_path)
        self.zones = zones
        self.source_id = source_id

        self.detector = CrowdDetector()
        self.tracker = CrowdTracker()
        self.optical_flow = OpticalFlowAnalyzer()

        self._zone_flow_history: dict[str, deque[float]] = {
            zone.zone_id: deque(maxlen=10) for zone in zones
        }
        self._zone_count_history: dict[str, deque[int]] = {
            zone.zone_id: deque(maxlen=2) for zone in zones
        }
        self._zone_positions: dict[str, tuple[int, int]] = {}
        for zone in zones:
            parsed_position = _parse_grid_position(zone.zone_id)
            if parsed_position is not None:
                self._zone_positions[zone.zone_id] = parsed_position

    def _reset_runtime_state(self) -> None:
        self.tracker.track_history.clear()
        self.tracker.frame_history.clear()
        for history in self._zone_flow_history.values():
            history.clear()
        for history in self._zone_count_history.values():
            history.clear()

    def _iter_frame_records(
        self,
        video_path: Path,
        sample_every_n_frames: int,
    ) -> Iterator[dict[str, Any]]:
        self._reset_runtime_state()

        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        try:
            fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            if fps <= 0.0:
                fps = 30.0

            start_time = datetime.now(timezone.utc)
            previous_gray: np.ndarray | None = None
            frame_number = 0

            while True:
                ok, frame = capture.read()
                if not ok:
                    break

                frame_height, frame_width = frame.shape[:2]
                tracked_detections = self.tracker.track_frame(frame)
                zone_assignments = self.detector.assign_to_zones(
                    tracked_detections, self.zones, frame_width, frame_height
                )

                current_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                if (
                    previous_gray is not None
                    and current_gray.shape == previous_gray.shape
                ):
                    flow_field = self.optical_flow.compute_flow(
                        previous_gray, current_gray
                    )
                else:
                    flow_field = None

                if frame_number % sample_every_n_frames == 0:
                    zones_payload: list[dict[str, Any]] = []
                    zone_payload_map: dict[str, dict[str, Any]] = {}
                    for zone in self.zones:
                        zone_tracks = zone_assignments.get(zone.zone_id, [])
                        crowd_count = len(zone_tracks)

                        # Density is normalized against a zone's configured expected maximum.
                        # This is a relative crowding score, not a physically calibrated
                        # density measurement, because arbitrary demo footage lacks camera
                        # calibration and real-world scale metadata.
                        density_score = self.detector.compute_density(zone_tracks, zone)

                        if flow_field is not None:
                            flow_stats = self.optical_flow.compute_zone_flow(
                                flow_field, zone, frame_width, frame_height
                            )
                        else:
                            flow_stats = {
                                "avg_flow_speed": 0.0,
                                "avg_flow_direction_deg": 0.0,
                                "avg_flow_direction_label": "N",
                            }

                        flow_history = self._zone_flow_history[zone.zone_id]
                        previous_flow_speed = (
                            flow_history[-1]
                            if flow_history
                            else float(flow_stats["avg_flow_speed"])
                        )
                        flow_history.append(float(flow_stats["avg_flow_speed"]))
                        rolling_avg_flow_speed = (
                            sum(flow_history) / len(flow_history)
                            if flow_history
                            else 0.0
                        )

                        count_history = self._zone_count_history[zone.zone_id]
                        previous_crowd_count = (
                            count_history[-1] if count_history else crowd_count
                        )
                        count_history.append(crowd_count)

                        anomaly_history = {
                            zone.zone_id: {
                                "current_flow_speed": float(
                                    flow_stats["avg_flow_speed"]
                                ),
                                "rolling_avg_flow_speed": float(rolling_avg_flow_speed),
                                "previous_flow_speed": float(previous_flow_speed),
                                "recent_flow_speeds": list(flow_history),
                                "current_crowd_count": crowd_count,
                                "previous_crowd_count": previous_crowd_count,
                                "current_density_score": float(density_score),
                            }
                        }
                        anomaly_result = self.tracker.detect_anomalies(
                            zone.zone_id,
                            zone_tracks,
                            float(flow_stats["avg_flow_direction_deg"]),
                            anomaly_history,
                        )

                        zones_payload.append(
                            {
                                "zone_id": zone.zone_id,
                                "bounds_normalized": _zone_bounds_payload(zone),
                                "crowd_count": crowd_count,
                                "density_score": float(density_score),
                                "avg_flow_speed": float(flow_stats["avg_flow_speed"]),
                                "avg_flow_direction_deg": float(
                                    flow_stats["avg_flow_direction_deg"]
                                ),
                                "avg_flow_direction_label": str(
                                    flow_stats["avg_flow_direction_label"]
                                ),
                                "reverse_flow_detected": bool(
                                    anomaly_result["reverse_flow_detected"]
                                ),
                                "bottleneck_detected": bool(
                                    anomaly_result["bottleneck_detected"]
                                ),
                                "anomaly_flags": list(anomaly_result["anomaly_flags"]),
                                "tracked_ids_in_zone": [
                                    int(track["track_id"])
                                    for track in zone_tracks
                                    if "track_id" in track
                                ],
                            }
                        )
                        zone_payload_map[zone.zone_id] = zones_payload[-1]

                    for zone in self.zones:
                        zone_payload = zone_payload_map.get(zone.zone_id)
                        if zone_payload is None:
                            continue

                        position = self._zone_positions.get(zone.zone_id)
                        if position is None:
                            continue

                        row_index, col_index = position
                        neighbor_speeds: list[float] = []
                        for neighbor_row, neighbor_col in (
                            (row_index - 1, col_index),
                            (row_index + 1, col_index),
                            (row_index, col_index - 1),
                            (row_index, col_index + 1),
                        ):
                            for neighbor_zone in self.zones:
                                if self._zone_positions.get(neighbor_zone.zone_id) == (
                                    neighbor_row,
                                    neighbor_col,
                                ):
                                    neighbor_speeds.append(
                                        float(
                                            zone_payload_map[neighbor_zone.zone_id][
                                                "avg_flow_speed"
                                            ]
                                        )
                                    )
                                    break

                        zone_payload["neighbor_avg_flow_speed"] = (
                            sum(neighbor_speeds) / len(neighbor_speeds)
                            if neighbor_speeds
                            else 0.0
                        )

                    total_crowd_count = sum(
                        zone_payload["crowd_count"] for zone_payload in zones_payload
                    )
                    if zones_payload:
                        max_zone_density_payload = max(
                            zones_payload, key=lambda payload: payload["density_score"]
                        )
                        max_zone_density = float(
                            max_zone_density_payload["density_score"]
                        )
                        highest_risk_zone_id = str(max_zone_density_payload["zone_id"])
                    else:
                        max_zone_density = 0.0
                        highest_risk_zone_id = ""

                    yield {
                        "timestamp": _format_utc_timestamp(
                            start_time, frame_number, fps
                        ),
                        "frame_number": frame_number,
                        "source_id": self.source_id,
                        "zones": zones_payload,
                        "frame_totals": {
                            "total_crowd_count": total_crowd_count,
                            "max_zone_density": max_zone_density,
                            "highest_risk_zone_id": highest_risk_zone_id,
                        },
                    }

                previous_gray = current_gray
                frame_number += 1
        finally:
            capture.release()

    def process_video(
        self,
        video_path: Path | str | None = None,
        sample_every_n_frames: int = DEFAULT_SAMPLE_EVERY_N_FRAMES,
        output_path: Path | str | None = None,
        mode: str = DEFAULT_MODE,
    ) -> list[dict[str, Any]] | Iterator[dict[str, Any]]:
        """Process a video in batch mode or return a streaming generator."""

        if sample_every_n_frames <= 0:
            raise ValueError("sample_every_n_frames must be greater than zero.")

        if mode not in {"batch", "stream"}:
            raise ValueError("mode must be either 'batch' or 'stream'.")

        resolved_video_path = (
            Path(video_path) if video_path is not None else self.video_path
        )

        if mode == "stream":
            if output_path is not None:
                raise ValueError("output_path is only supported in batch mode.")
            return self._iter_frame_records(resolved_video_path, sample_every_n_frames)

        records = list(
            self._iter_frame_records(resolved_video_path, sample_every_n_frames)
        )
        if output_path is not None:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with output_file.open("w", encoding="utf-8") as handle:
                json.dump(records, handle, indent=2)

        return records


def _parse_zones_argument(zones_arg: str) -> list[Zone]:
    zone_spec = zones_arg.strip()
    if "x" in zone_spec.lower():
        rows_str, cols_str = zone_spec.lower().split("x", 1)
        return generate_grid_zones(int(rows_str), int(cols_str))

    zone_path = Path(zone_spec)
    if zone_path.exists():
        return load_zones_from_json(zone_path)

    raise ValueError(
        "--zones must be either an NxM grid such as 3x3 or a path to a JSON file."
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the CrowdShield CV pipeline.")
    parser.add_argument("--video", required=True, help="Path to the input video file.")
    parser.add_argument(
        "--zones",
        required=True,
        help="Zone grid definition, for example 3x3, or a path to a zone JSON file.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional path to write the batch JSON output.",
    )
    parser.add_argument(
        "--source-id",
        default=DEFAULT_SOURCE_ID,
        help="Logical source identifier to place in the output JSON.",
    )
    parser.add_argument(
        "--sample-every-n-frames",
        type=int,
        default=DEFAULT_SAMPLE_EVERY_N_FRAMES,
        help="Only emit a JSON record for every Nth frame.",
    )
    parser.add_argument(
        "--mode",
        choices=["batch", "stream"],
        default=DEFAULT_MODE,
        help="Batch writes a JSON array; stream yields records one at a time.",
    )
    return parser


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()

    zones = _parse_zones_argument(args.zones)
    pipeline = CVPipeline(args.video, zones, source_id=args.source_id)
    result = pipeline.process_video(
        video_path=args.video,
        sample_every_n_frames=args.sample_every_n_frames,
        output_path=args.output,
        mode=args.mode,
    )

    if args.mode == "stream":
        for record in result:
            print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
