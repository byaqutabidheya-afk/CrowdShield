#!/usr/bin/env python3
"""
verify_recommendations.py — Verification script for RecommendationEngine.

Loads phase2_sample_output.json fixture, invokes RecommendationEngine with a live
Gemini API call, pretty-prints the output JSON, and validates requirements a-d.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Set up paths
SCRIPT_DIR = Path(__file__).resolve().parent
GENAI_PIPELINE_DIR = SCRIPT_DIR.parent
FIXTURE_PATH = GENAI_PIPELINE_DIR / "fixtures" / "phase2_sample_output.json"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from recommendation_engine import RecommendationEngine


def run_verification():
    print("=" * 60)
    print("  CrowdShield - RecommendationEngine Live Verification")
    print("=" * 60)

    # 1. Load fixture data
    if not FIXTURE_PATH.exists():
        print(f"FAIL: Fixture file not found at {FIXTURE_PATH}")
        sys.exit(1)

    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    zones = data.get("zones", [])
    target_zone = None
    neighbor_zones = []

    for z in zones:
        if target_zone is None and z.get("risk_level") in ("high", "critical"):
            target_zone = z
        else:
            neighbor_zones.append(z)

    if not target_zone:
        print("FAIL: No zone with risk_level 'high' or 'critical' found in fixture.")
        sys.exit(1)

    print(f"\n[1] Target Zone selected: {target_zone.get('zone_id')} (Risk Level: {target_zone.get('risk_level')})")
    print(f"    Neighbor Zones count : {len(neighbor_zones)}")

    # 2. Call RecommendationEngine with real API
    print("\n[2] Calling RecommendationEngine with live Gemini API...")
    engine = RecommendationEngine()
    result = engine.generate_recommendations(target_zone, neighbor_zones_data=neighbor_zones)

    # 3. Pretty-print raw JSON result
    print("\n" + "=" * 60)
    print("  LIVE GEMINI RECOMMENDATION RESPONSE JSON")
    print("=" * 60)
    print(json.dumps(result, indent=2))
    print("=" * 60 + "\n")

    # 4. Perform Checks a, b, c, d
    print("VERIFICATION CHECKS SUMMARY")
    print("-" * 60)

    all_passed = True

    # Check a: "recommendations" key exists and has 2-4 entries
    recs = result.get("recommendations", [])
    check_a_passed = isinstance(recs, list) and 2 <= len(recs) <= 4
    status_a = "PASS" if check_a_passed else "FAIL"
    print(f"[Check A] Recommendations list count is between 2 and 4 (actual: {len(recs)}): {status_a}")
    if not check_a_passed:
        all_passed = False

    # Check b: every recommendation has 4 required keys: action, category, urgency, reasoning
    required_keys = {"action", "category", "urgency", "reasoning"}
    check_b_passed = True
    for idx, r in enumerate(recs):
        if not isinstance(r, dict) or not required_keys.issubset(r.keys()):
            check_b_passed = False
            break
    status_b = "PASS" if check_b_passed else "FAIL"
    print(f"[Check B] All recommendations contain keys {sorted(list(required_keys))}: {status_b}")
    if not check_b_passed:
        all_passed = False

    # Check c: reasoning text for at least 1 recommendation references contributing factors
    factors = target_zone.get("contributing_factors", {})
    factor_keywords = [
        "density", "rate of change", "convergence", "bottleneck", "anomaly",
        "density_score", "density_rate_of_change", "flow_convergence_score",
        "bottleneck_indicator", "bottleneck_score", "anomaly_indicator", "anomaly_score"
    ]
    check_c_passed = False
    for r in recs:
        reasoning = r.get("reasoning", "").lower()
        action = r.get("action", "").lower()
        combined_text = f"{action} {reasoning}"
        if any(kw.lower() in combined_text for kw in factor_keywords):
            check_c_passed = True
            break
    status_c = "PASS" if check_c_passed else "FAIL"
    print(f"[Check C] Reasoning references zone contributing factor keywords: {status_c}")
    if not check_c_passed:
        all_passed = False

    # Check d: flow_convergence_score dominance check
    # Filter numeric factor values from contributing_factors
    numeric_factors = {
        k: v for k, v in factors.items()
        if isinstance(v, (int, float))
    }
    
    max_val = max(numeric_factors.values()) if numeric_factors else 0
    convergence_val = factors.get("flow_convergence_score", 0)
    is_convergence_dominant = (convergence_val > 0 and convergence_val >= max_val)

    if is_convergence_dominant:
        flow_keywords = ["one-way", "one way", "flow direction", "flow-direction", "direction change"]
        check_d_passed = False
        for r in recs:
            text = (r.get("action", "") + " " + r.get("reasoning", "")).lower()
            if any(kw in text for kw in flow_keywords):
                check_d_passed = True
                break
        status_d = "PASS" if check_d_passed else "FAIL"
        print(f"[Check D] Flow convergence dominant ({convergence_val} == max {max_val}) -> action/reasoning mentions one-way/flow direction: {status_d}")
        if not check_d_passed:
            all_passed = False
    else:
        print(f"[Check D] NOTE: Check N/A because flow_convergence_score ({convergence_val}) is not dominant (max is {max_val}).")

    print("-" * 60)
    final_status = "ALL PASSED [OK]" if all_passed else "SOME CHECKS FAILED [FAIL]"
    print(f"FINAL RESULT: {final_status}\n")


if __name__ == "__main__":
    run_verification()
