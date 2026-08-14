import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
import cv2
from tracker import CrowdTracker

cap = cv2.VideoCapture('D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4')
cap.set(cv2.CAP_PROP_POS_FRAMES, 600)

tracker = CrowdTracker()
frame_idx = 600

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    # Process YOLO tracking
    tracked_objs = tracker.track_frame(frame)
    
    # Check erratic movement directly
    fast_headings = []
    
    for track in tracked_objs:
        track_id = track.get("track_id")
        if track_id is None:
            continue
            
        history = list(tracker.track_history.get(int(track_id), []))[-10:]
        if len(history) < 6:
            continue
            
        start_pos = history[0]
        end_pos = history[-1]
        dist = ((end_pos[0] - start_pos[0])**2 + (end_pos[1] - start_pos[1])**2)**0.5
        
        if dist > 25.0:
            import math
            # Using _vector_heading_degrees logic
            dx = end_pos[0] - start_pos[0]
            dy = end_pos[1] - start_pos[1]
            h = math.degrees(math.atan2(dx, -dy)) % 360.0
            fast_headings.append(h)
            
    print(f"Frame {frame_idx} | Tracks: {len(tracked_objs)} | Fast Tracks: {len(fast_headings)} | Headings: {[f'{h:.1f}' for h in fast_headings]}")
    
    erratic = tracker._detect_erratic_movement(tracked_objs)
    if erratic:
        print(f"*** ERRATIC MOVEMENT DETECTED AT FRAME {frame_idx} ***")
    
    frame_idx += 1
    if frame_idx > 760:
        break

cap.release()
