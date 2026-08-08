"""
Test 2.12 (build guide): Run predict_blockages where a MIDDLE zone of a 3-zone route
(not the origin or destination) is critical -> route is correctly flagged at_risk_of_blockage: true
with blocking_zone_id pointing at the middle zone, confirming the check isn't just endpoint-based.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from route_blockage_predictor import RouteBlockagePredictor

# Define a 3-zone route: A1 (origin) -> B2 (middle) -> C3 (exit)
routes = [
    {
        "route_id": "route_zone_A1_to_zone_C3",
        "origin_zone_id": "zone_A1",
        "exit_zone_id": "zone_C3",
        "zone_sequence": ["zone_A1", "zone_B2", "zone_C3"],
    }
]

# Set ONLY the middle zone (zone_B2) to critical risk. Origin (A1) and Exit (C3) stay calm/low.
current_scored_zones = {
    "zone_A1": {"zone_id": "zone_A1", "risk_score": 0.10, "risk_level": "low"},
    "zone_B2": {"zone_id": "zone_B2", "risk_score": 0.85, "risk_level": "critical"},  # MIDDLE ZONE
    "zone_C3": {"zone_id": "zone_C3", "risk_score": 0.10, "risk_level": "low"},
}

predictor = RouteBlockagePredictor()
predictions = predictor.predict_blockages(
    routes=routes,
    current_scored_zones=current_scored_zones,
)

print("predict_blockages Prediction Result:")
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

if is_flagged and correct_blocker:
    print("PASS: Middle zone blockage correctly detected! Check is not endpoint-limited.")
else:
    print(f"FAIL: Expected at_risk_of_blockage=True and blocking_zone_id='zone_B2', got at_risk_of_blockage={result.get('at_risk_of_blockage')}, blocking_zone_id={result.get('blocking_zone_id')}")
