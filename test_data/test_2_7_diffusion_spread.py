"""
Test 2.7 (build guide): Run simulate_steps for 10 steps on a single
high-risk zone with populated neighbors -> neighbor risk scores should
increase monotonically across steps (before decay dominates), demonstrating
visible "spread".

Mirror setup to Test 2.6, but the opposite condition: zone_B2 (center) is
the SOURCE of high risk. Its 4 neighbors (A2, B1, B3, C2) start at LOW risk
but are POPULATED (crowd_count > 0), so diffusion into them should NOT be
gated -- their risk scores should visibly rise across steps.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai_core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from panic_diffusion import PanicDiffusionModel

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

# zone_B2 (center) is the SOURCE: high risk. Its 4 direct neighbors start
# LOW so any rise from diffusion is easy to see. Outer corners stay low too
# and aren't adjacent to B2, so they're an implicit control group.
current_zone_risk_scores = {
    "zone_A1": 0.05,
    "zone_A2": 0.10,  # neighbor of B2 (north) -- expect this to rise
    "zone_A3": 0.05,
    "zone_B1": 0.10,  # neighbor of B2 (west) -- expect this to rise
    "zone_B2": 0.85,  # SOURCE: high risk
    "zone_B3": 0.10,  # neighbor of B2 (east) -- expect this to rise
    "zone_C1": 0.05,
    "zone_C2": 0.10,  # neighbor of B2 (south) -- expect this to rise
    "zone_C3": 0.05,
}

# THE KEY DIFFERENCE FROM TEST 2.6: every zone here, including the
# neighbors, has a real crowd_count > 0 -- so diffusion into them should
# NOT be gated.
zone_crowd_counts = {
    "zone_A1": 2,
    "zone_A2": 8,
    "zone_A3": 2,
    "zone_B1": 9,
    "zone_B2": 30,
    "zone_B3": 8,
    "zone_C1": 2,
    "zone_C2": 9,
    "zone_C3": 2,
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

neighbors = ["zone_A2", "zone_B1", "zone_B3", "zone_C2"]

print("Neighbor risk scores across all simulated steps (expect a rise, at least early on):")
header = f"{'step':>5} {'time_s':>8} " + " ".join(f"{n:>12}" for n in neighbors)
print(header)

prev = {n: current_zone_risk_scores[n] for n in neighbors}
rose_at_least_once = {n: False for n in neighbors}

for step in steps:
    row = f"{step['step']:>5} {step['time_offset_seconds']:>8} "
    for n in neighbors:
        score = step["zone_risk_scores"][n]
        if score > prev[n] + 1e-9:
            rose_at_least_once[n] = True
        row += f"{score:>12.4f}"
        prev[n] = score
    print(row)

print()
for n in neighbors:
    status = "PASS -- rose at some point" if rose_at_least_once[n] else "FAIL -- never increased"
    print(f"{n}: {status}")
