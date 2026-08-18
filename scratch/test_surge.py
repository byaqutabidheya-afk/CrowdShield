import sys
from pathlib import Path

ai_core_dir = Path("D:/CrowdShield/ai_core")
if str(ai_core_dir) not in sys.path:
    sys.path.insert(0, str(ai_core_dir))

from cv_pipeline.scripts.pipeline import CVPipeline
from shared.zone_config import generate_grid_zones

zones = generate_grid_zones(2, 2)
pipeline = CVPipeline(video_path="D:/CrowdShield/ai_core/cv_pipeline/sample_videos/surge.mp4", zones=zones)

frames = pipeline.process_video(mode="batch")
counts = [f["frame_totals"]["total_crowd_count"] for f in frames]
print("Max crowd count:", max(counts))
print("Last 5 crowd counts:", counts[-5:])
print("Total frames processed:", len(counts))

