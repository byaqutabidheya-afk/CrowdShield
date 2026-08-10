"""Verification script for Step 5 Streaming + GenAI LLM Happy Path."""

from unittest.mock import MagicMock
from ai_core.cv_pipeline.scripts.pipeline import CVPipeline
from ai_core.risk_engine.scripts.pipeline import RiskEngine
from ai_core.genai_pipeline.scripts.pipeline import GenAIPipeline
from ai_core.shared.zone_config import generate_grid_zones


def main():
    print("=== Step 5 Verification: GenAI Happy Path (Non-Fallback) ===")

    # 1. Instantiate CVPipeline & stream frames
    video_path = "ai_core/cv_pipeline/sample_videos/anomaly.mp4"
    zones = generate_grid_zones(frame_width=640, frame_height=360, rows=3, cols=3)
    cv_pipeline = CVPipeline(video_path=video_path, zones=zones)
    stream = cv_pipeline.process_video(mode="stream", sample_every_n_frames=5)

    frames = [next(stream) for _ in range(4)]
    print(f"[CV PIPELINE] Streamed 4 frames. Frame 4 frame_number={frames[-1]['frame_number']}")

    # 2. RiskEngine processes frame in-memory
    risk_engine = RiskEngine()
    risk_result = risk_engine.process_frame(cv_pipeline_frame_json=frames[-1])
    sample_scored_zone = risk_result["zones"][0]
    print(f"[RISK ENGINE] Processed frame. Scored {len(risk_result['zones'])} zones. Sample zone risk_score={sample_scored_zone['risk_score']}")

    # 3. Create mock LLM client returning genuine structured JSON responses
    mock_llm_client = MagicMock()
    mock_llm_client.generate_json.return_value = {
        "recommendations": [
            {
                "action": "Deploy 4 security personnel to Gate 2 to redirect inflow to Exit B",
                "category": "resource_deployment",
                "urgency": "immediate",
                "reasoning": "High flow convergence and rising density detected in Zone A1.",
            },
            {
                "action": "Broadcast multilingual evacuation alert over PA system",
                "category": "communication",
                "urgency": "immediate",
                "reasoning": "Prevent panic diffusion into neighboring Zone A2.",
            },
        ]
    }

    # 4. Instantiate GenAIPipeline with mock LLM client
    genai_pipeline = GenAIPipeline(llm_client=mock_llm_client)
    rec_result = genai_pipeline.recommend(
        zone_risk_data=sample_scored_zone,
        neighbor_zones_data=risk_result["zones"][1:],
    )

    print("\n--- Genuine (Non-Fallback) GenAI Recommendation Output ---")
    print(f"Target Zone ID: {rec_result.get('zone_id')}")
    print(f"Risk Level:     {rec_result.get('risk_level')}")
    print(f"Generated At:   {rec_result.get('generated_at')}")
    print(f"Recommendations Count: {len(rec_result.get('recommendations', []))}")
    for i, rec in enumerate(rec_result.get("recommendations", []), 1):
        print(f"\nRecommendation #{i}:")
        print(f"  Action:    {rec.get('action')}")
        print(f"  Category:  {rec.get('category')}")
        print(f"  Urgency:   {rec.get('urgency')}")
        print(f"  Reasoning: {rec.get('reasoning')}")

    # Check that fallback reason is NOT present
    fallback_used = any(
        "fallback" in rec.get("reasoning", "").lower()
        for rec in rec_result.get("recommendations", [])
    )
    print(f"\nFallback used: {fallback_used}")
    assert not fallback_used, "Recommendation should be genuine, not fallback!"
    print("\nPASS: GenAI Happy Path executed successfully with package-qualified imports!")


if __name__ == "__main__":
    main()
