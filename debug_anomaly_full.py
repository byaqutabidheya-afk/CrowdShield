import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
import cv2
from tracker import CrowdTracker
from collections import deque
import math

cap = cv2.VideoCapture('D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 600)

tracker = CrowdTracker()
frame_idx = 600

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    tracked_objs = tracker.track_frame(frame)
    
    # Simulate detect_anomalies
    # Suppose all tracks are in ONE zone for the sake of debug
    history = {"dummy_zone": {"current_crowd_count": len(tracked_objs)}}
    
    res = tracker.detect_anomalies("dummy_zone", tracked_objs, 0.0, history)
    
    if res.get("erratic_movement_flag"):
        print(f"Frame {frame_idx} | ERRATIC MOVEMENT DETECTED BY TRACKER!")
    else:
        # Check what the group logic saw
        fast_headings = []
        active_tracks = tracker.frame_history[-1] if tracker.frame_history else {}
        for t_id, hist_deque in tracker.track_history.items():
            if t_id not in active_tracks:
                continue
            hist = list(hist_deque)[-10:]
            if len(hist) < 6:
                continue
            dist = math.hypot(hist[-1][0] - hist[0][0], hist[-1][1] - hist[0][1])
            if dist > 25.0:
                fast_headings.append(dist)
        
        if len(fast_headings) >= 2:
            print(f"Frame {frame_idx} | No erratic, but fast_headings count = {len(fast_headings)}")
    
    frame_idx += 1
    if frame_idx > 700:
        break

cap.release()
