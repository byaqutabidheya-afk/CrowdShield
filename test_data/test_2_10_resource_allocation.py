"""
Test 2.10 (build guide): Run ResourceAllocator.suggest_allocations on scored
zones with a clear single highest-risk zone -> that zone should appear
FIRST in suggestions with priority: "high", and its reason string should
reference its dominant contributing factor.

Input here mirrors the shape of RiskScorer.score_frame()'s real output
(contributing_factors with density_score, density_rate_of_change,
flow_convergence_score, bottleneck_score, anomaly_score), since that's
what suggest_allocations actually consumes.
"""

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
SCRIPTS_DIR = PROJECT_ROOT / "ai-core" / "risk_engine" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from resource_allocator import ResourceAllocator

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

# zone_B2 is the CLEAR single highest-risk zone, dominated by a bottleneck.
# All other zones sit at meaningfully lower risk, so ranking is unambiguous.
scored_zones = [
    {
        "zone_id": "zone_B2",
        "risk_score": 0.85,
        "risk_level": "critical",
        "contributing_factors": {
            "density_score": 0.55,
            "density_rate_of_change": 0.10,
            "flow_convergence_score": 0.05,
            "bottleneck_score": 1.0,   # dominant factor -- should drive "security_personnel"
            "anomaly_score": 0.1,
        },
    },
    {
        "zone_id": "zone_A2",
        "risk_score": 0.30,
        "risk_level": "moderate",
        "contributing_factors": {
            "density_score": 0.30,
            "density_rate_of_change": 0.05,
            "flow_convergence_score": 0.10,
            "bottleneck_score": 0.0,
            "anomaly_score": 0.0,
        },
    },
    {
        "zone_id": "zone_B1",
        "risk_score": 0.25,
        "risk_level": "moderate",
        "contributing_factors": {
            "density_score": 0.28,
            "density_rate_of_change": 0.02,
            "flow_convergence_score": 0.05,
            "bottleneck_score": 0.0,
            "anomaly_score": 0.0,
        },
    },
    {
        "zone_id": "zone_C1",
        "risk_score": 0.10,
        "risk_level": "low",
        "contributing_factors": {
            "density_score": 0.10,
            "density_rate_of_change": 0.0,
            "flow_convergence_score": 0.0,
            "bottleneck_score": 0.0,
            "anomaly_score": 0.0,
        },
    },
]

allocator = ResourceAllocator()
suggestions = allocator.suggest_allocations(
    scored_zones=scored_zones,
    adjacency_map=adjacency_map,
    historical_incident_zones=None,
    top_n=3,
)

print("Full suggestions output:")
for s in suggestions:
    print(s)

print()
if suggestions and suggestions[0]["zone_id"] == "zone_B2":
    print("PASS-CANDIDATE: zone_B2 appears FIRST in suggestions.")
else:
    print(f"FAIL: expected zone_B2 first, got {suggestions[0]['zone_id'] if suggestions else 'EMPTY LIST'}")

if suggestions and suggestions[0].get("priority") == "high":
    print("PASS-CANDIDATE: zone_B2's priority is 'high'.")
else:
    print(f"FAIL: expected priority 'high', got {suggestions[0].get('priority') if suggestions else 'N/A'}")

reason = suggestions[0].get("reason", "") if suggestions else ""
print(f"\nReason string: {reason!r}")
if "bottleneck" in reason.lower():
    print("PASS-CANDIDATE: reason references 'bottleneck', the dominant contributing factor.")
else:
    print("CHECK MANUALLY: reason does not literally contain 'bottleneck' -- confirm it still "
          "meaningfully references the dominant factor in different wording.")
