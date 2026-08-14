import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
import cv2
from tracker import CrowdTracker, _smoothed_positions, _vector_heading_degrees, _angle_difference_degrees

cap = cv2.VideoCapture('D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 600)

tracker = CrowdTracker()
frame_idx = 600

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    tracked_objs = tracker.track_frame(frame)
    
    for track in tracked_objs:
        track_id = track.get("track_id")
        history = list(tracker.track_history.get(int(track_id), []))[-10:]
        if len(history) < 6:
            continue
            
        smoothed = _smoothed_positions(history, window_size=3)
        if len(smoothed) >= 4:
            headings = []
            for p, c in zip(smoothed, smoothed[1:]):
                dx = c[0] - p[0]
                dy = c[1] - p[1]
                if dx != 0.0 or dy != 0.0:
                    headings.append(_vector_heading_degrees(dx, dy))
            
            changes = []
            for h1, h2 in zip(headings, headings[1:]):
                changes.append(_angle_difference_degrees(h1, h2))
            
            # Print if any large change
            if any(c > 60 for c in changes):
                print(f"Frame {frame_idx} | Track {track_id} | Changes: {[f'{c:.1f}' for c in changes]}")
    
    frame_idx += 1
    if frame_idx > 700:
        break

cap.release()
