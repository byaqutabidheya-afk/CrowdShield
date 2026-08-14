import asyncio
import sys
from pathlib import Path

# Setup paths
backend_dir = Path("D:/CrowdShield/backend")
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

ai_core_dir = Path("D:/CrowdShield/ai_core")
if str(ai_core_dir) not in sys.path:
    sys.path.insert(0, str(ai_core_dir))

from app.services import supabase_client
from ai_core.cv_pipeline.scripts.pipeline import CVPipeline
from ai_core.risk_engine.scripts.pipeline import RiskEngine

async def main():
    zones_config = supabase_client.get_zone_config("cam_01")
    from app.services.orchestrator import _normalize_zones
    zones = _normalize_zones(zones_config)
    video_src = "D:/CrowdShield/ai_core/cv_pipeline/sample_videos/surge.mp4"
    
    cv_pipeline = CVPipeline(
        video_path=video_src,
        zones=zones,
        source_id="cam_01",
    )
    risk_engine = RiskEngine()
    
    frame_generator = cv_pipeline.process_video(
        video_path=video_src,
        sample_every_n_frames=3,
        mode="stream",
    )
    
    print("Processing frames...")
    count = 0
    triggered = False
    for cv_frame in frame_generator:
        count += 1
        if count % 10 == 0:
            print(f"Processed {count} frames...")
            
        risk_output = risk_engine.process_frame(
            cv_frame,
            diffusion_rate=0.15,
            decay_rate=0.05,
        )
        
        # Check if any zone has critical risk or bottleneck
        for risk_zone in risk_output.get("zones", []):
            if risk_zone["risk_level"] == "critical" or risk_zone["risk_score"] >= 0.75:
                print(f"CRITICAL RISK in {risk_zone['zone_id']} at frame {count}")
                triggered = True
                
        # Also check raw cv_frame for bottleneck
        for z in cv_frame.get("zones", []):
            if z.get("bottleneck_detected"):
                print(f"BOTTLENECK DETECTED in {z['zone_id']} at frame {count}")
                triggered = True
                
    if not triggered:
        print("NO BOTTLENECKS OR CRITICAL ALERTS TRIGGERED!")

if __name__ == "__main__":
    asyncio.run(main())
