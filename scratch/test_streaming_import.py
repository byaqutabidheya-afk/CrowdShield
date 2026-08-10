"""Throwaway script to test Phase 1 streaming generator -> Phase 2 RiskEngine in-memory import handoff."""

from ai_core.cv_pipeline.scripts.pipeline import CVPipeline
from ai_core.risk_engine.scripts.pipeline import RiskEngine
from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
from ai_core.shared.zone_config import generate_grid_zones


def main():
    print("=== Step 5: Testing In-Memory Import & Streaming Path ===")

    # 1. Instantiate CVPipeline with a real sample video and small Zone list (3x3 grid = 9 zones)
    video_path = "ai_core/cv_pipeline/sample_videos/anomaly.mp4"
    zones = generate_grid_zones(frame_width=640, frame_height=360, rows=3, cols=3)
    cv_pipeline = CVPipeline(video_path=video_path, zones=zones)

    # 2. Call .process_video(..., mode="stream")
    stream = cv_pipeline.process_video(mode="stream", sample_every_n_frames=5)

    frames = []
    print("\n--- Pulling 4 frames from CVPipeline generator ---")
    for i, frame_data in enumerate(stream):
        frames.append(frame_data)
        print(
            f"Frame {i + 1}: frame_number={frame_data.get('frame_number')}, timestamp={frame_data.get('timestamp')}, zones_count={len(frame_data.get('zones', []))}"
        )
        if len(frames) >= 4:
            break

    # 3. Instantiate RiskEngine and feed one frame into RiskEngine.process_frame()
    print("\n--- Feeding Frame 4 directly into RiskEngine.process_frame() ---")
    risk_engine = RiskEngine()
    risk_result = risk_engine.process_frame(cv_pipeline_frame_json=frames[-1])

    print("\n--- Phase 2 Output via Direct Import Handoff ---")
    print(f"Timestamp: {risk_result.get('timestamp')}")
    print(f"Scored Zones Count: {len(risk_result.get('zones', []))}")

    sample_scored_zone = risk_result["zones"][0] if risk_result.get("zones") else {}
    print(f"Sample Zone ({sample_scored_zone.get('zone_id')}):")
    print(f"  Risk Score: {sample_scored_zone.get('risk_score')}")
    print(f"  Risk Level: {sample_scored_zone.get('risk_level')}")
    print(f"  Contributing Factors: {sample_scored_zone.get('contributing_factors')}")

    print("\nTop-level keys in RiskEngine output:")
    for k in risk_result.keys():
        print(f"  - {k}")

    # 4. Instantiate GenAIPipeline and run recommendation on highest risk zone
    genai_pipeline = GenAIPipeline()
    rec_result = genai_pipeline.recommend(
        zone_risk_data=sample_scored_zone,
        neighbor_zones_data=risk_result["zones"][1:],
    )
    print("\n--- Phase 3 GenAI Output via Direct Import Handoff ---")
    print(f"Target Zone: {rec_result.get('zone_id')}")
    print(f"Risk Level: {rec_result.get('risk_level')}")
    print(f"Recommendations: {rec_result.get('recommendations')}")

    print("\nSUCCESS: All 3 pipelines instantiated & executed seamlessly in-memory via imports!")


if __name__ == "__main__":
    main()
