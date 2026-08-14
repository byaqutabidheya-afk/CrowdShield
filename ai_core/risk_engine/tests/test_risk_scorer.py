from __future__ import annotations

import math
import sys
from pathlib import Path

AI_CORE_DIR = Path(__file__).resolve().parents[2]
RISK_ENGINE_SCRIPTS_DIR = AI_CORE_DIR / "risk_engine" / "scripts"

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))
if str(RISK_ENGINE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_SCRIPTS_DIR))

from risk_scorer import RiskScorer


def test_compute_risk_score_applies_configured_weights() -> None:
    scorer = RiskScorer()
    scorer.compute_density_rate_of_change = lambda zone_id, current_density: 0.2  # type: ignore[method-assign]
    scorer.compute_flow_convergence = (
        lambda zone_id, all_zones_this_frame, adjacency_map: 0.75
    )  # type: ignore[method-assign]

    zone_frame_data = {
        "zone_id": "zone_A1",
        "density_score": 0.6,
        "bottleneck_detected": True,
        "anomaly_flags": ["sudden_stop", "reverse_flow"],
    }

    result = scorer.compute_risk_score(
        zone_frame_data, [zone_frame_data], {"zone_A1": []}
    )

    expected_score = max(0.35 * 0.6 + 0.25 * 0.2 + 0.20 * 0.75 + 0.15 * 1.0 + 0.05 * (2 / 3), 0.75)

    assert math.isclose(result["risk_score"], expected_score, rel_tol=1e-9)
    assert result["risk_level"] == "critical"
    assert result["contributing_factors"]["density_score"] == 0.6
    assert result["contributing_factors"]["density_rate_of_change"] == 0.2
    assert result["contributing_factors"]["flow_convergence_score"] == 0.75
    assert result["contributing_factors"]["bottleneck_score"] == 1.0
    assert result["contributing_factors"]["anomaly_score"] == 2 / 3
