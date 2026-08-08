"""
Test 2.8 (build guide): Run predict_crush_timeline on a simulation where a
zone crosses 0.75 by step 5 -> returns a timeline entry for that zone with
the correct predicted_critical_at_seconds.

Setup: zone_B2 starts at a moderate 0.45 risk, adjacent to a sustained
high-risk source (zone_A2 at 0.85, held roughly constant by giving it its
own crowd but no inbound neighbors feeding it further). Per a rough forward
estimate using the stated diffusion formula, zone_B2 should cross 0.75
around step 4-5, comfortably within this test's target window.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
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

# zone_B2 (TARGET) starts at 0.45 -- NOT already close to critical at step 0,
# so we can also observe which confidence bucket predict_crush_timeline
# assigns once it crosses 0.75 partway through the 10-step simulation.
current_zone_risk_scores = {
    "zone_A1": 0.05,
    "zone_A2": 0.85,  # sustained high-risk source, feeds into B2
    "zone_A3": 0.05,
    "zone_B1": 0.10,
    "zone_B2": 0.45,  # TARGET: should cross 0.75 around step 4-5
    "zone_B3": 0.10,
    "zone_C1": 0.05,
    "zone_C2": 0.10,
    "zone_C3": 0.05,
}

zone_crowd_counts = {
    "zone_A1": 2,
    "zone_A2": 25,
    "zone_A3": 2,
    "zone_B1": 8,
    "zone_B2": 20,
    "zone_B3": 8,
    "zone_C1": 2,
    "zone_C2": 8,
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

print("zone_B2 risk score across all simulated steps:")
for step in steps:
    score = step["zone_risk_scores"]["zone_B2"]
    flag = "  <-- crosses 0.75" if score >= 0.75 else ""
    print(f"step {step['step']:>2}  time_offset_s={step['time_offset_seconds']:>4}  zone_B2={score:.4f}{flag}")

print()
print("Running predict_crush_timeline...")
timeline = model.predict_crush_timeline(steps, critical_threshold=0.75)
print(timeline)

print()
b2_entries = [entry for entry in timeline if entry.get("zone_id") == "zone_B2"]
if b2_entries:
    print("PASS-CANDIDATE: zone_B2 has a timeline entry:")
    print(b2_entries[0])
else:
    print("FAIL: zone_B2 does not appear in predict_crush_timeline output, "
          "even though its risk score crossed 0.75 in the simulated steps above.")
