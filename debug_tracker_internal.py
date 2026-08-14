import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
import cv2
from tracker import CrowdTracker
from detector import CrowdDetector
from collections import deque
import math

cap = cv2.VideoCapture('D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 600)

tracker = CrowdTracker()
detector = CrowdDetector()
frame_idx = 600

class DummyZone:
    def __init__(self):
        self.zone_id = "zone_0_0"
        self.bounds_normalized = {"x_min": 0.0, "x_max": 1.0, "y_min": 0.0, "y_max": 1.0}

zones = [DummyZone()]

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    tracked_objs = tracker.track_frame(frame)
    zone_assignments = detector.assign_to_zones(tracked_objs, zones, frame.shape[1], frame.shape[0])
    
    history = {"zone_0_0": {"current_crowd_count": len(tracked_objs)}}
    
    # We call _detect_erratic_movement directly
    tracks_in_zone = zone_assignments.get("zone_0_0", [])
    
    fast_headings = []
    if tracker.frame_history:
        active_tracks = tracker.frame_history[-1]
        for track_id, history_deque in tracker.track_history.items():
            if track_id not in active_tracks:
                continue
            hist = list(history_deque)[-10:]
            if len(hist) < 6:
                continue
            dist = math.hypot(hist[-1][0] - hist[0][0], hist[-1][1] - hist[0][1])
            if dist > 25.0:
                fast_headings.append(dist)
    
    has_erratic = tracker._detect_erratic_movement(tracks_in_zone)
    if has_erratic:
        print(f"Frame {frame_idx} | ERRATIC MOVEMENT DETECTED! (fast_headings={len(fast_headings)})")
    elif len(fast_headings) >= 2:
        print(f"Frame {frame_idx} | Missed it! (fast_headings={len(fast_headings)})")
    
    frame_idx += 1
    if frame_idx > 700:
        break

cap.release()
