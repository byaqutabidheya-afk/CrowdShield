import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
import cv2
import math
from collections import deque
from tracker import CrowdTracker, _vector_heading_degrees, _angle_difference_degrees

cap = cv2.VideoCapture('D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 600)

tracker = CrowdTracker()
frame_idx = 600

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    tracked_objs = tracker.track_frame(frame)
    
    # Simulate group dispersion logic exactly as it is in tracker.py
    fast_headings = []
    for track in tracked_objs:
        track_id = track.get("track_id")
        history = list(tracker.track_history.get(int(track_id), deque()))[-10:]
        if len(history) < 6:
            continue
            
        start_pos = history[0]
        end_pos = history[-1]
        dist = math.hypot(end_pos[0] - start_pos[0], end_pos[1] - start_pos[1])
        if dist > 25.0:
            fast_headings.append(_vector_heading_degrees(end_pos[0] - start_pos[0], end_pos[1] - start_pos[1]))
            
    is_scatter = False
    max_diff = 0.0
    if len(fast_headings) >= 2:
        for i in range(len(fast_headings)):
            for j in range(i + 1, len(fast_headings)):
                diff = _angle_difference_degrees(fast_headings[i], fast_headings[j])
                if diff > max_diff:
                    max_diff = diff
        
        if max_diff > 45.0:
            is_scatter = True
            
    if is_scatter:
        print(f"Frame {frame_idx} | SCATTER DETECTED! (Fast tracks: {len(fast_headings)}, Max diff: {max_diff:.1f})")
    
    frame_idx += 1
    if frame_idx > 700:
        break

cap.release()
