"""
Test 2.9 (build guide): Run PreEventSimulator.simulate_arrival_buildup with
expected_attendance=5000 on a small 3x3 zone grid with 1 entry zone ->
entry zone density should climb steadily; congestion should visibly diffuse
into adjacent zones over the simulated steps.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from pre_event_simulator import PreEventSimulator

adjacency_map = {
    "zone_A1": ["zone_A2", "zone_B1"],
    "zone_A2": ["zone_A1", "zone_A3", "zone_B2"],
    "zone_A3": ["zone_A2", "zone_B3"],
    "zone_B1": ["zone_A1", "zone_B2", "zone_C1"],
    "zone_B2": ["zone_A2", "zone_B1", "zone_B3", "zone_C2"],
    "zone_B3": ["zone_A3", "zone_B2", "zone_C3"],
    "zone_C1": ["zone_B1", "zone_C2"],
    "zone_C2": ["zone_B2", "zone_C1", "zone_C3"],
    "zone_C3": ["zone_B3", "zone_C2"],
}

# zones need max_expected_count so density_score can be computed as people
# arrive. zone_A1 is the ENTRY zone -- a corner, as a realistic venue
# entrance would be. Modest capacities so 5000 attendees create real load.
zones = [
    {"zone_id": "zone_A1", "bounds_normalized": {"x_min": 0.0, "y_min": 0.0, "x_max": 0.33, "y_max": 0.33}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_A2", "bounds_normalized": {"x_min": 0.33, "y_min": 0.0, "x_max": 0.66, "y_max": 0.33}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_A3", "bounds_normalized": {"x_min": 0.66, "y_min": 0.0, "x_max": 1.0, "y_max": 0.33}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_B1", "bounds_normalized": {"x_min": 0.0, "y_min": 0.33, "x_max": 0.33, "y_max": 0.66}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_B2", "bounds_normalized": {"x_min": 0.33, "y_min": 0.33, "x_max": 0.66, "y_max": 0.66}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_B3", "bounds_normalized": {"x_min": 0.66, "y_min": 0.33, "x_max": 1.0, "y_max": 0.66}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_C1", "bounds_normalized": {"x_min": 0.0, "y_min": 0.66, "x_max": 0.33, "y_max": 1.0}, "max_expected_count": 60, "is_exit": False},
    {"zone_id": "zone_C2", "bounds_normalized": {"x_min": 0.33, "y_min": 0.66, "x_max": 0.66, "y_max": 1.0}, "max_expected_count": 60, "is_exit": True},
    {"zone_id": "zone_C3", "bounds_normalized": {"x_min": 0.66, "y_min": 0.66, "x_max": 1.0, "y_max": 1.0}, "max_expected_count": 60, "is_exit": False},
]

simulator = PreEventSimulator()
steps = simulator.simulate_arrival_buildup(
    zones=zones,
    entry_zone_ids=["zone_A1"],
    expected_attendance=5000,
    adjacency_map=adjacency_map,
    arrival_duration_minutes=30,
    num_steps=20,
)

print(f"Simulated {len(steps)} steps.\n")

print("zone_A1 (ENTRY) risk/density trajectory across all steps:")
prev_a1 = None
a1_climbed = True
for step in steps:
    score = step["zone_risk_scores"].get("zone_A1")
    flag = ""
    if prev_a1 is not None and score < prev_a1 - 1e-9:
        flag = "  <-- DROPPED (unexpected if arrivals are still ongoing)"
        a1_climbed = False
    print(f"step {step['step']:>2}  t={step['time_offset_seconds']:>4}s  zone_A1={score:.4f}{flag}")
    prev_a1 = score

print()
print("Adjacent zones (zone_A2, zone_B1) trajectory -- should show diffusion from zone_A1:")
for zid in ["zone_A2", "zone_B1"]:
    print(f"\n{zid}:")
    for step in steps:
        score = step["zone_risk_scores"].get(zid)
        print(f"  step {step['step']:>2}  t={step['time_offset_seconds']:>4}s  {zid}={score:.4f}")

print()
print("Non-adjacent far zone (zone_C3) trajectory -- for contrast, should rise slower/later if at all:")
for step in steps:
    score = step["zone_risk_scores"].get("zone_C3")
    print(f"  step {step['step']:>2}  t={step['time_offset_seconds']:>4}s  zone_C3={score:.4f}")
