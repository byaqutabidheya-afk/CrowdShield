from __future__ import annotations

import sys
from pathlib import Path

AI_CORE_DIR = Path(__file__).resolve().parents[2]
RISK_ENGINE_SCRIPTS_DIR = AI_CORE_DIR / "risk_engine" / "scripts"

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))
if str(RISK_ENGINE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_SCRIPTS_DIR))

from route_blockage_predictor import RouteBlockagePredictor


def test_predict_blockages_flags_any_zone_along_route_and_keeps_safe_routes_clear() -> (
    None
):
    predictor = RouteBlockagePredictor()
    routes = [
        {"route_id": "route_A", "zone_sequence": ["zone_A1", "zone_A2", "zone_A3"]},
        {"route_id": "route_B", "zone_sequence": ["zone_B1", "zone_B2", "zone_B3"]},
    ]

    current_scored_zones = {
        "zone_A1": {"risk_level": "low"},
        "zone_A2": {"risk_level": "high"},
        "zone_A3": {"risk_level": "low"},
        "zone_B1": {"risk_level": "low"},
        "zone_B2": {"risk_level": "low"},
        "zone_B3": {"risk_level": "low"},
    }
    simulated_steps = [
        {
            "step": 1,
            "time_offset_seconds": 30,
            "zone_risk_scores": {"zone_B1": 0.20, "zone_B2": 0.30, "zone_B3": 0.25},
        },
        {
            "step": 2,
            "time_offset_seconds": 60,
            "zone_risk_scores": {"zone_B1": 0.25, "zone_B2": 0.40, "zone_B3": 0.30},
        },
    ]

    predictions = predictor.predict_blockages(
        routes=routes,
        current_scored_zones=current_scored_zones,
        simulated_steps=simulated_steps,
        near_term_step_count=2,
    )

    route_a = next(route for route in predictions if route["route_id"] == "route_A")
    route_b = next(route for route in predictions if route["route_id"] == "route_B")

    assert route_a["at_risk_of_blockage"] is True
    assert route_a["blocking_zone_id"] == "zone_A2"
    assert route_a["reason"] == "currently_high_risk"
    assert route_b["at_risk_of_blockage"] is False
    assert route_b["blocking_zone_id"] is None
    assert route_b["reason"] is None
