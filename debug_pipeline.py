import sys
import os
sys.path.append(os.path.abspath("D:/CrowdShield"))
sys.path.append(os.path.abspath("D:/CrowdShield/ai_core/cv_pipeline/scripts"))
from pipeline import CVPipeline
import asyncio
from pathlib import Path
from detector import ZoneConfig

async def main():
    video_path = Path("D:/CrowdShield/ai_core/cv_pipeline/sample_videos/anomaly.mp4")
    # Add dummy zones to match standard format
    zones = [
        ZoneConfig(zone_id=f"zone_{r}_{c}", bounds=[(0.0,0.0), (1.0,0.0), (1.0,1.0), (0.0,1.0)])
        for r in range(1) for c in range(1)
    ]
    
    pipeline = CVPipeline(video_path, zones)
    
    gen = pipeline.run_live_processing(sample_every_n_frames=3)
    for frame_data in gen:
        # Check if any zone has erratic movement
        zones = frame_data.get("zones", [])
        for z in zones:
            flags = z.get("anomaly_flags", [])
            if "erratic_movement" in flags:
                print(f"Frame {frame_data.get('timestamp')} | Zone {z['zone_id']} | ERRATIC MOVEMENT DETECTED!")
            if "bottleneck" in flags:
                print(f"Frame {frame_data.get('timestamp')} | Zone {z['zone_id']} | BOTTLENECK DETECTED!")

asyncio.run(main())
