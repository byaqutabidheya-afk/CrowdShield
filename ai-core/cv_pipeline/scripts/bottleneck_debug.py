"""Debug script to log bottleneck detection values for baseline.mp4."""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np

CURRENT_DIR = Path(__file__).resolve().parent
CV_PIPELINE_DIR = CURRENT_DIR.parent
if str(CV_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(CV_PIPELINE_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from detector import CrowdDetector
from optical_flow import OpticalFlowAnalyzer
from tracker import CrowdTracker
from zone_config import generate_grid_zones


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
    zone_count_history: dict[str, deque[int]] = {
        zone.zone_id: deque(maxlen=2) for zone in zones
    }

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Could not open {video_path}")
        return

    prev_gray = None
    frame_number = 0
    bottleneck_events = []
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

        if frame_number % sample_every == 0:
            for zone in zones:
                zone_tracks = zone_assignments.get(zone.zone_id, [])
                crowd_count = len(zone_tracks)
                density_score = detector.compute_density(zone_tracks, zone)

                if flow_field is not None:
                    flow_stats = optical_flow.compute_zone_flow(
                        flow_field, zone, w, h
                    )
                else:
                    flow_stats = {
                        "avg_flow_speed": 0.0,
                        "avg_flow_direction_deg": 0.0,
                        "avg_flow_direction_label": "N",
                    }

                flow_hist = zone_flow_history[zone.zone_id]
                prev_flow_speed = (
                    flow_hist[-1] if flow_hist else float(flow_stats["avg_flow_speed"])
                )
                flow_hist.append(float(flow_stats["avg_flow_speed"]))
                rolling_avg = (
                    sum(flow_hist) / len(flow_hist) if flow_hist else 0.0
                )

                count_hist = zone_count_history[zone.zone_id]
                prev_crowd_count = count_hist[-1] if count_hist else crowd_count
                count_hist.append(crowd_count)

                current_speed = float(flow_stats["avg_flow_speed"])

                # Compute what _detect_bottleneck sees
                if rolling_avg > 0:
                    speed_drop_ratio = 1.0 - (current_speed / rolling_avg)
                else:
                    speed_drop_ratio = 0.0

                is_density_high = density_score >= tracker.min_bottleneck_density
                is_crowd_not_decreasing = crowd_count >= prev_crowd_count

                # Check if bottleneck would trigger
                would_trigger = (
                    is_density_high
                    and is_crowd_not_decreasing
                    and rolling_avg > 0
                    and speed_drop_ratio > tracker.BOTTLENECK_SPEED_DROP_RATIO
                )

                if would_trigger or (crowd_count > 0 and frame_number % 30 == 0):
                    event = {
                        "frame": frame_number,
                        "zone": zone.zone_id,
                        "crowd_count": crowd_count,
                        "prev_crowd_count": prev_crowd_count,
                        "density_score": round(density_score, 4),
                        "current_speed": round(current_speed, 4),
                        "rolling_avg_speed": round(rolling_avg, 4),
                        "prev_flow_speed": round(prev_flow_speed, 4),
                        "speed_drop_ratio": round(speed_drop_ratio, 4),
                        "density_threshold": tracker.min_bottleneck_density,
                        "drop_threshold": tracker.BOTTLENECK_SPEED_DROP_RATIO,
                        "density_high": is_density_high,
                        "crowd_not_decreasing": is_crowd_not_decreasing,
                        "TRIGGERED": would_trigger,
                    }
                    if would_trigger:
                        bottleneck_events.append(event)
                        print(f"  *** BOTTLENECK TRIGGERED at frame {frame_number}, zone {zone.zone_id}")
                        print(f"      density={density_score:.4f} speed={current_speed:.4f} "
                              f"rolling={rolling_avg:.4f} drop_ratio={speed_drop_ratio:.4f} "
                              f"crowd={crowd_count} prev_crowd={prev_crowd_count}")

        prev_gray = gray
        frame_number += 1

    cap.release()

    print(f"\nTotal frames processed: {frame_number}")
    print(f"Bottleneck events: {len(bottleneck_events)}")
    if bottleneck_events:
        print("\nAll bottleneck trigger events:")
        for evt in bottleneck_events:
            print(f"  Frame {evt['frame']:>4d} | Zone {evt['zone']:>8s} | "
                  f"density={evt['density_score']:.4f} speed={evt['current_speed']:.4f} "
                  f"rolling={evt['rolling_avg_speed']:.4f} drop={evt['speed_drop_ratio']:.4f} "
                  f"crowd={evt['crowd_count']} prev={evt['prev_crowd_count']}")


if __name__ == "__main__":
    videos_dir = Path(__file__).resolve().parent.parent / "sample_videos"

    # Run on baseline first to see the false positives
    debug_video(str(videos_dir / "baseline.mp4"), "baseline.mp4")

    # Then run on the others to see what normal detections look like
    for video_name in ["empty_room.mp4", "surge.mp4", "anomaly.mp4"]:
        debug_video(str(videos_dir / video_name), video_name)
