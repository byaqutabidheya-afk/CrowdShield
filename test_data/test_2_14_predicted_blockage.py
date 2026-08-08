"""
Test 2.14 (build guide): Run predict_blockages with a currently-calm route where simulated_steps
shows a zone on it crossing into high/critical risk (>= 0.55) within the near-term window ->
route flagged at_risk_of_blockage: true with reason: "predicted_high_risk_within_simulation",
distinguishing predicted vs. current blockage.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from route_blockage_predictor import RouteBlockagePredictor

# Define route: A1 -> B2 -> C3
routes = [
    {
        "route_id": "route_zone_A1_to_zone_C3",
        "origin_zone_id": "zone_A1",
        "exit_zone_id": "zone_C3",
        "zone_sequence": ["zone_A1", "zone_B2", "zone_C3"],
    }
]

# Currently ALL zones are calm in current_scored_zones (low risk level)
current_scored_zones = {
    "zone_A1": {"zone_id": "zone_A1", "risk_score": 0.10, "risk_level": "low"},
    "zone_B2": {"zone_id": "zone_B2", "risk_score": 0.25, "risk_level": "low"},  # Currently calm!
    "zone_C3": {"zone_id": "zone_C3", "risk_score": 0.10, "risk_level": "low"},
}

# Near-term simulated steps show zone_B2 crossing >= 0.55 at Step 2 (60s)
simulated_steps = [
    {
        "step": 1,
        "time_offset_seconds": 30,
        "zone_risk_scores": {"zone_A1": 0.15, "zone_B2": 0.40, "zone_C3": 0.12},
    },
    {
        "step": 2,
        "time_offset_seconds": 60,
        "zone_risk_scores": {"zone_A1": 0.20, "zone_B2": 0.65, "zone_C3": 0.15},  # Crosses 0.55!
    },
    {
        "step": 3,
        "time_offset_seconds": 90,
        "zone_risk_scores": {"zone_A1": 0.25, "zone_B2": 0.85, "zone_C3": 0.20},
    },
]

predictor = RouteBlockagePredictor()
predictions = predictor.predict_blockages(
    routes=routes,
    current_scored_zones=current_scored_zones,
    simulated_steps=simulated_steps,
    near_term_step_count=3,
)

print("predict_blockages Near-Term Prediction Result:")
for pred in predictions:
    print(f"  Route ID: {pred['route_id']}")
    print(f"  Zone Sequence: {pred['zone_sequence']}")
    print(f"  At Risk of Blockage: {pred['at_risk_of_blockage']}")
    print(f"  Blocking Zone ID: {pred['blocking_zone_id']}")
    print(f"  Reason: {pred['reason']}")

print("\nValidation Check:")
result = predictions[0]
is_flagged = result.get("at_risk_of_blockage") is True
correct_blocker = result.get("blocking_zone_id") == "zone_B2"
correct_reason = result.get("reason") == "predicted_high_risk_within_simulation"

if is_flagged and correct_blocker and correct_reason:
    print("PASS: Predicted blockage correctly identified with reason 'predicted_high_risk_within_simulation'.")
else:
    print(f"FAIL: Expected at_risk_of_blockage=True, blocking_zone_id='zone_B2', reason='predicted_high_risk_within_simulation'. Got: {result}")
