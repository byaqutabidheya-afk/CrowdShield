"""
Test 2.15 (build guide): Run full RiskEngine.process_frame on a real Phase 1 output frame ->
produces valid JSON matching the full Phase 2 schema (including route_blockage_predictions),
no missing fields, no exceptions.
"""

import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from pipeline import RiskEngine

# Load real Phase 1 sample frame
sample_file = PROJECT_ROOT / "ai-core" / "risk_engine" / "tests" / "sample_data" / "phase1_sample_frames.json"
with open(sample_file, "r", encoding="utf-8") as f:
    phase1_frames = json.load(f)

first_frame = phase1_frames[0]

# Run full RiskEngine.process_frame
engine = RiskEngine()
phase2_output = engine.process_frame(first_frame)

print("RiskEngine.process_frame executed successfully without exceptions.")
print("\nTop-level keys in generated Phase 2 output:")
for k in phase2_output.keys():
    print(f" - {k}")

# Validate required top-level schema keys
required_keys = [
    "timestamp",
    "zones",
    "panic_propagation",
    "predicted_crush_timeline",
    "resource_allocation_suggestions",
    "route_blockage_predictions",
]

missing_keys = [k for k in required_keys if k not in phase2_output]

print("\n--- Schema Validation Breakdown ---")

# 1. Zones check
zones = phase2_output.get("zones", [])
first_zone = zones[0] if zones else {}
zone_keys = ["zone_id", "risk_score", "risk_level", "contributing_factors"]
zone_missing = [k for k in zone_keys if k not in first_zone]

# 2. Panic propagation check
panic = phase2_output.get("panic_propagation", {})
sim_steps = panic.get("simulated_steps", [])

# 3. Route blockage predictions check
routes = phase2_output.get("route_blockage_predictions", [])
first_route = routes[0] if routes else {}
route_keys = ["route_id", "origin_zone_id", "exit_zone_id", "zone_sequence", "at_risk_of_blockage", "blocking_zone_id", "reason"]
route_missing = [k for k in route_keys if k not in first_route]

print(f"Timestamp: {phase2_output.get('timestamp')}")
print(f"Zones Scored: {len(zones)} zone(s), sample zone schema complete: {len(zone_missing) == 0}")
print(f"Simulated Propagation Steps: {len(sim_steps)} step(s)")
print(f"Crush Timeline Predictions: {len(phase2_output.get('predicted_crush_timeline', []))} item(s)")
print(f"Resource Suggestions: {len(phase2_output.get('resource_allocation_suggestions', []))} item(s)")
print(f"Route Blockage Predictions: {len(routes)} route(s), sample route schema complete: {len(route_missing) == 0}")

print("\nValidation Result:")
if len(missing_keys) == 0 and len(zone_missing) == 0 and len(route_missing) == 0:
    print("PASS: RiskEngine.process_frame produced 100% compliant Phase 2 schema output with zero missing fields or exceptions.")
else:
    print(f"FAIL: Schema validation failed. Missing top-level keys: {missing_keys}, zone missing: {zone_missing}, route missing: {route_missing}")
