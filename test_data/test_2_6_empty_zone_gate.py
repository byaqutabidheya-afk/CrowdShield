"""
Test 2.6 (build guide): PanicDiffusionModel.simulate_steps where a neighbor
zone has crowd_count: 0 -> that empty zone's risk score must NOT increase
from diffusion, confirming the crowd_count gate in the spec:

    risk_delta = neighbor.risk_score * diffusion_rate * (1.0 if
                 zone_crowd_counts[this_zone] > 0 else 0.0)

Setup: zone_B2 is EMPTY (crowd_count=0) but sits at the center of the grid,
adjacent to 4 zones (A2, B1, B3, C2) that are all HIGH risk and crowded.
If the gate works, zone_B2's risk score should never rise across simulated
steps, even though every neighbor is trying to diffuse risk into it.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from panic_diffusion import PanicDiffusionModel

# Same 3x3 adjacency used throughout our test suite
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

# zone_B2 starts at a nonzero baseline risk (0.10) so we can clearly detect
# if the value creeps UP from diffusion, vs staying flat/only decaying.
current_zone_risk_scores = {
    "zone_A1": 0.10,
    "zone_A2": 0.80,  # high risk, adjacent to B2 (north)
    "zone_A3": 0.10,
    "zone_B1": 0.85,  # high risk, adjacent to B2 (west)
    "zone_B2": 0.10,  # TARGET: empty zone, starts at low baseline risk
    "zone_B3": 0.82,  # high risk, adjacent to B2 (east)
    "zone_C1": 0.10,
    "zone_C2": 0.83,  # high risk, adjacent to B2 (south)
    "zone_C3": 0.10,
}

# THE KEY LINE: zone_B2 has crowd_count 0. All its high-risk neighbors have
# real crowds -- so risk COULD plausibly spread FROM them, but the gate
# should block it from spreading INTO an empty zone.
zone_crowd_counts = {
    "zone_A1": 3,
    "zone_A2": 25,
    "zone_A3": 3,
    "zone_B1": 28,
    "zone_B2": 0,   # <-- EMPTY. This is what we're testing.
    "zone_B3": 26,
    "zone_C1": 3,
    "zone_C2": 27,
    "zone_C3": 3,
}

model = PanicDiffusionModel()
steps = model.simulate_steps(
    current_zone_risk_scores=current_zone_risk_scores,
    zone_crowd_counts=zone_crowd_counts,
    adjacency_map=adjacency_map,
    num_steps=10,
    seconds_per_step=30,
    diffusion_rate=0.15,
    decay_rate=0.05,
)

print("zone_B2 risk score across all simulated steps (should NEVER increase above 0.10):")
print(f"{'step':>5} {'time_offset_s':>15} {'zone_B2_risk':>15}")
prev = current_zone_risk_scores["zone_B2"]
violation_found = False
for step in steps:
    b2_score = step["zone_risk_scores"]["zone_B2"]
    flag = ""
    if b2_score > prev + 1e-9:
        flag = "  <-- INCREASED (gate may be broken)"
        violation_found = True
    print(f"{step['step']:>5} {step['time_offset_seconds']:>15} {b2_score:>15.4f}{flag}")
    prev = b2_score

print()
if violation_found:
    print("RESULT: FAIL -- zone_B2's risk score increased at some step despite crowd_count=0.")
else:
    print("RESULT: PASS -- zone_B2's risk score never increased; the crowd_count gate is working.")
