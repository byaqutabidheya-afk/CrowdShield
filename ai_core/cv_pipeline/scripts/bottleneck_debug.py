"""Debug script to log bottleneck detection values for surge.mp4 and comparison videos."""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np

CURRENT_DIR = Path(__file__).resolve().parent
CV_PIPELINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = CV_PIPELINE_DIR.parent
if str(CV_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(CV_PIPELINE_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from detector import CrowdDetector
from optical_flow import OpticalFlowAnalyzer
from tracker import CrowdTracker
from shared.zone_config import generate_grid_zones


def debug_video(video_path: str, video_label: str) -> None:
    print(f"\n{'='*80}")
    print(f"DEBUGGING: {video_label} ({video_path})")
    print(f"{'='*80}")

    zones = generate_grid_zones(3, 3)
    detector = CrowdDetector()
    tracker = CrowdTracker()
    optical_flow = OpticalFlowAnalyzer()

    zone_flow_history: dict[str, deque[float]] = {
        zone.zone_id: deque(maxlen=10) for zone in zones
    }
    zone_raw_flow_history: dict[str, deque[float]] = {
        zone.zone_id: deque(maxlen=30) for zone in zones
    }
    zone_count_history: dict[str, deque[int]] = {
        zone.zone_id: deque(maxlen=2) for zone in zones
    }

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Could not open {video_path}")
        return

    prev_gray = None
    frame_number = 0
    bottleneck_events: list[dict] = []
    sample_every = 3

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        h, w = frame.shape[:2]
        tracked = tracker.track_frame(frame)
        zone_assignments = detector.assign_to_zones(tracked, zones, w, h)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if prev_gray is not None and gray.shape == prev_gray.shape:
            flow_field = optical_flow.compute_flow(prev_gray, gray)
        else:
            flow_field = None

        # Update raw-flow rolling history on every frame so burst motion is captured
        if flow_field is not None:
            for zone in zones:
                rs = optical_flow.compute_zone_raw_flow(flow_field, zone, w, h)
                zone_raw_flow_history[zone.zone_id].append(float(rs["raw_avg_speed"]))

        if frame_number % sample_every == 0:
            for zone in zones:
                zone_tracks = zone_assignments.get(zone.zone_id, [])
                crowd_count = len(zone_tracks)
                density_score = detector.compute_density(zone_tracks, zone)

                if flow_field is not None:
                    flow_stats = optical_flow.compute_zone_flow(flow_field, zone, w, h)
                    raw_stats = optical_flow.compute_zone_raw_flow(flow_field, zone, w, h)
                else:
                    flow_stats = {
                        "avg_flow_speed": 0.0,
                        "avg_flow_direction_deg": 0.0,
                        "avg_flow_direction_label": "N",
                    }
                    raw_stats = {"raw_avg_speed": 0.0, "flow_spatial_variance": 0.0}

                flow_hist = zone_flow_history[zone.zone_id]
                prev_flow_speed = (
                    flow_hist[-1] if flow_hist else float(flow_stats["avg_flow_speed"])
                )
                flow_hist.append(float(flow_stats["avg_flow_speed"]))
                rolling_avg = sum(flow_hist) / len(flow_hist) if flow_hist else 0.0

                raw_hist = zone_raw_flow_history[zone.zone_id]
                raw_rolling = sum(raw_hist) / len(raw_hist) if raw_hist else 0.0

                count_hist = zone_count_history[zone.zone_id]
                prev_crowd_count = count_hist[-1] if count_hist else crowd_count
                count_hist.append(crowd_count)

                anomaly_history = {
                    zone.zone_id: {
                        "current_flow_speed": float(flow_stats["avg_flow_speed"]),
                        "rolling_avg_flow_speed": rolling_avg,
                        "previous_flow_speed": prev_flow_speed,
                        "current_crowd_count": crowd_count,
                        "previous_crowd_count": prev_crowd_count,
                        "current_density_score": density_score,
                        "neighbor_avg_flow_speed": 0.0,
                        "raw_current_flow_speed": float(raw_stats["raw_avg_speed"]),
                        "raw_rolling_flow_speed": raw_rolling,
                        "flow_spatial_variance": float(raw_stats["flow_spatial_variance"]),
                    }
                }

                result = tracker.detect_anomalies(
                    zone.zone_id,
                    zone_tracks,
                    float(flow_stats["avg_flow_direction_deg"]),
                    anomaly_history,
                )
                triggered = result["bottleneck_detected"]

                if triggered or frame_number % 100 == 0:
                    event = {
                        "frame": frame_number,
                        "zone": zone.zone_id,
                        "crowd_count": crowd_count,
                        "density_score": round(density_score, 4),
                        "raw_speed": round(float(raw_stats["raw_avg_speed"]), 4),
                        "raw_rolling": round(raw_rolling, 4),
                        "flow_variance": round(float(raw_stats["flow_spatial_variance"]), 2),
                        "TRIGGERED": triggered,
                    }
                    if triggered:
                        bottleneck_events.append(event)
                        print(f"  *** BOTTLENECK TRIGGERED frame {frame_number}, zone {zone.zone_id}")
                    else:
                        print(f"  [INFO] frame {frame_number}, zone {zone.zone_id}")
                    print(
                        f"      crowd={crowd_count} density={density_score:.4f} "
                        f"raw_spd={raw_stats['raw_avg_speed']:.3f} raw_roll={raw_rolling:.3f} "
                        f"variance={raw_stats['flow_spatial_variance']:.2f}"
                    )

        prev_gray = gray
        frame_number += 1

    cap.release()

    print(f"\nTotal frames processed: {frame_number}")
    print(f"Bottleneck events: {len(bottleneck_events)}")
    if bottleneck_events:
        print("\nAll bottleneck trigger events:")
        for evt in bottleneck_events:
            print(
                f"  Frame {evt['frame']:>4d} | Zone {evt['zone']:>8s} | "
                f"crowd={evt['crowd_count']} density={evt['density_score']:.4f} "
                f"raw_spd={evt['raw_speed']:.3f} raw_roll={evt['raw_rolling']:.3f} "
                f"variance={evt['flow_variance']:.2f}"
            )


if __name__ == "__main__":
    videos_dir = Path(__file__).resolve().parent.parent / "sample_videos"
    debug_video(str(videos_dir / "surge.mp4"), "surge.mp4")
    print("\n\n--- COMPARISON: normal videos should show 0 or very few triggers ---")
    for vid in ["baseline.mp4", "directional_flow.mp4", "static_crowd.mp4", "sparse_walking.mp4", "empty_room.mp4"]:
        debug_video(str(videos_dir / vid), vid)
