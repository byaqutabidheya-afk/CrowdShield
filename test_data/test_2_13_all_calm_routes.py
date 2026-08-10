"""
Test 2.13 (build guide): Run predict_blockages where no zone on any route is high/critical,
with no simulated_steps provided -> all routes return at_risk_of_blockage: false,
blocking_zone_id: null, and reason: null.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai_core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from route_blockage_predictor import RouteBlockagePredictor

# Define multiple routes across the grid
routes = [
    {
        "route_id": "route_zone_A1_to_zone_C3",
        "origin_zone_id": "zone_A1",
        "exit_zone_id": "zone_C3",
        "zone_sequence": ["zone_A1", "zone_A2", "zone_A3", "zone_B3", "zone_C3"],
    },
    {
        "route_id": "route_zone_B1_to_zone_C3",
        "origin_zone_id": "zone_B1",
        "exit_zone_id": "zone_C3",
        "zone_sequence": ["zone_B1", "zone_B2", "zone_B3", "zone_C3"],
    },
    {
        "route_id": "route_zone_C1_to_zone_C3",
        "origin_zone_id": "zone_C1",
        "exit_zone_id": "zone_C3",
        "zone_sequence": ["zone_C1", "zone_C2", "zone_C3"],
    },
]

# All zones are calm/low-risk
current_scored_zones = {
    "zone_A1": {"zone_id": "zone_A1", "risk_score": 0.10, "risk_level": "low"},
    "zone_A2": {"zone_id": "zone_A2", "risk_score": 0.12, "risk_level": "low"},
    "zone_A3": {"zone_id": "zone_A3", "risk_score": 0.15, "risk_level": "low"},
    "zone_B1": {"zone_id": "zone_B1", "risk_score": 0.08, "risk_level": "low"},
    "zone_B2": {"zone_id": "zone_B2", "risk_score": 0.25, "risk_level": "low"},
    "zone_B3": {"zone_id": "zone_B3", "risk_score": 0.18, "risk_level": "low"},
    "zone_C1": {"zone_id": "zone_C1", "risk_score": 0.05, "risk_level": "low"},
    "zone_C2": {"zone_id": "zone_C2", "risk_score": 0.10, "risk_level": "low"},
    "zone_C3": {"zone_id": "zone_C3", "risk_score": 0.05, "risk_level": "low"},
}

predictor = RouteBlockagePredictor()
predictions = predictor.predict_blockages(
    routes=routes,
    current_scored_zones=current_scored_zones,
    simulated_steps=None,  # No simulated steps provided
)

print(f"predict_blockages Evaluation ({len(predictions)} routes):\n")
print(f"{'Route ID':<25} | {'At Risk':<10} | {'Blocking Zone':<15} | {'Reason':<15}")
print("-" * 75)

all_calm = True
for pred in predictions:
    at_risk = pred["at_risk_of_blockage"]
    blocker = pred["blocking_zone_id"]
    reason = pred["reason"]
    
    if at_risk is not False or blocker is not None or reason is not None:
        all_calm = False
        
    print(f"{pred['route_id']:<25} | {str(at_risk):<10} | {str(blocker):<15} | {str(reason):<15}")

print("\nValidation Result:")
if all_calm and len(predictions) == len(routes):
    print("PASS: All routes correctly returned at_risk_of_blockage=False with no blocking zone or reason.")
else:
    print("FAIL: One or more routes were unexpectedly flagged as blocked.")
