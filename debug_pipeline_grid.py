import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
from pipeline import CVPipeline
from detector import Zone
import asyncio
from pathlib import Path

async def main():
    video_path = Path("D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4")
    
    zones = []
    # 3x3 grid like the dashboard default
    for r in range(3):
        for c in range(3):
            z_id = f"zone_{r}_{c}"
            r_size = 1.0 / 3
            c_size = 1.0 / 3
            y_min = r * r_size
            y_max = (r + 1) * r_size
            x_min = c * c_size
            x_max = (c + 1) * c_size
            bounds = {"x_min": x_min, "x_max": x_max, "y_min": y_min, "y_max": y_max}
            zones.append(Zone(zone_id=z_id, bounds_normalized=bounds))
            
    pipeline = CVPipeline(video_path, zones)
    
    gen = pipeline._iter_frame_records(video_path=video_path, sample_every_n_frames=3)
    found_erratic = False
    for frame_data in gen:
        frame_zones = frame_data.get("zones", [])
        for z in frame_zones:
            flags = z.get("anomaly_flags", [])
            if "erratic_movement" in flags:
                print(f"Frame {frame_data.get('timestamp')} | Zone {z['zone_id']} | ERRATIC MOVEMENT DETECTED!")
                found_erratic = True
                
        if frame_data.get("frames_processed", 0) > 250:
            break

asyncio.run(main())
