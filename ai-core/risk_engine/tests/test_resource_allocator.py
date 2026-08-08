from __future__ import annotations

import sys
from pathlib import Path

AI_CORE_DIR = Path(__file__).resolve().parents[2]
RISK_ENGINE_SCRIPTS_DIR = AI_CORE_DIR / "risk_engine" / "scripts"

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))
if str(RISK_ENGINE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_SCRIPTS_DIR))

from resource_allocator import ResourceAllocator, generate_mock_historical_data


def test_suggest_allocations_returns_top_n_plus_historical_zones_without_duplicates() -> (
    None
):
    allocator = ResourceAllocator()
    scored_zones = [
        {
            "zone_id": "zone_A1",
            "risk_score": 0.95,
            "contributing_factors": {
                "flow_convergence_score": 0.82,
                "bottleneck_score": 0.10,
            },
        },
        {
            "zone_id": "zone_A2",
            "risk_score": 0.88,
            "contributing_factors": {
                "bottleneck_score": 0.91,
                "flow_convergence_score": 0.15,
            },
        },
        {
            "zone_id": "zone_A3",
            "risk_score": 0.80,
            "contributing_factors": {
                "density_score": 0.77,
                "flow_convergence_score": 0.20,
            },
        },
        {
            "zone_id": "zone_A4",
            "risk_score": 0.40,
            "contributing_factors": {"density_score": 0.35, "bottleneck_score": 0.05},
        },
    ]

    suggestions = allocator.suggest_allocations(
        scored_zones=scored_zones,
        adjacency_map={"zone_A1": ["zone_A2"], "zone_A2": ["zone_A1"]},
        historical_incident_zones=["zone_A2", "zone_A4"],
        top_n=2,
    )

    zone_ids = [suggestion["zone_id"] for suggestion in suggestions]

    assert len(zone_ids) == 3
    assert len(zone_ids) == len(set(zone_ids))
    assert set(zone_ids) == {"zone_A1", "zone_A2", "zone_A4"}
    assert any(
        suggestion["zone_id"] == "zone_A2"
        and suggestion["suggestion_type"] == "medical_tent"
        for suggestion in suggestions
    )


def test_generate_mock_historical_data_returns_demo_events() -> None:
    payload = generate_mock_historical_data()

    assert "events" in payload
    assert len(payload["events"]) >= 2
