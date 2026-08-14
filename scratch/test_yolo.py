import cv2
import sys
from ultralytics import YOLO

def main():
    model = YOLO("yolov8n.pt")
    cap = cv2.VideoCapture("D:/CrowdShield/ai_core/cv_pipeline/sample_videos/surge.mp4")
    
    ok, frame = cap.read()
    if not ok:
        print("Failed to read video.")
        sys.exit(1)
        
    print("Testing YOLO on first frame...")
    results_default = model.predict(frame, verbose=False)
    boxes_default = results_default[0].boxes
    people_default = sum(1 for c in boxes_default.cls if int(c) == 0) if boxes_default is not None else 0
    print(f"Detections at default conf: {people_default}")

    results_low = model.predict(frame, conf=0.05, verbose=False)
    boxes_low = results_low[0].boxes
    people_low = sum(1 for c in boxes_low.cls if int(c) == 0) if boxes_low is not None else 0
    print(f"Detections at conf=0.05: {people_low}")

    results_ultra_low = model.predict(frame, conf=0.01, verbose=False)
    boxes_ultra_low = results_ultra_low[0].boxes
    people_ultra_low = sum(1 for c in boxes_ultra_low.cls if int(c) == 0) if boxes_ultra_low is not None else 0
    print(f"Detections at conf=0.01: {people_ultra_low}")
    
if __name__ == "__main__":
    main()
