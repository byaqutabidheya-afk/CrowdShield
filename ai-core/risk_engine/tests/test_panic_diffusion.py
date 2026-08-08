from __future__ import annotations

import sys
from pathlib import Path

AI_CORE_DIR = Path(__file__).resolve().parents[2]
RISK_ENGINE_SCRIPTS_DIR = AI_CORE_DIR / "risk_engine" / "scripts"

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))
if str(RISK_ENGINE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_SCRIPTS_DIR))

from panic_diffusion import PanicDiffusionModel


def test_simulate_steps_only_spreads_to_zones_with_crowd() -> None:
    model = PanicDiffusionModel()

    current_zone_risk_scores = {
        "zone_A1": 1.0,
        "zone_A2": 0.0,
        "zone_A3": 0.0,
    }
    zone_crowd_counts = {
        "zone_A1": 10,
        "zone_A2": 0,
        "zone_A3": 8,
    }
    adjacency_map = {
        "zone_A1": ["zone_A2", "zone_A3"],
        "zone_A2": ["zone_A1"],
        "zone_A3": ["zone_A1"],
    }

    steps = model.simulate_steps(
        current_zone_risk_scores=current_zone_risk_scores,
        zone_crowd_counts=zone_crowd_counts,
        adjacency_map=adjacency_map,
        num_steps=1,
        seconds_per_step=30,
        diffusion_rate=0.2,
        decay_rate=0.0,
    )

    first_step = steps[0]["zone_risk_scores"]

    assert first_step["zone_A2"] == 0.0
    assert first_step["zone_A3"] > 0.0
    assert first_step["zone_A3"] > first_step["zone_A2"]
