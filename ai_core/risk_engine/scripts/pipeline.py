"""Risk-engine orchestration pipeline for CrowdShield."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
RISK_ENGINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = RISK_ENGINE_DIR.parent

if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))
if str(RISK_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

try:
    from ai_core.risk_engine.scripts.panic_diffusion import PanicDiffusionModel
    from ai_core.risk_engine.scripts.pre_event_simulator import PreEventSimulator
    from ai_core.risk_engine.scripts.resource_allocator import ResourceAllocator
    from ai_core.risk_engine.scripts.route_blockage_predictor import RouteBlockagePredictor
    from ai_core.risk_engine.scripts.risk_scorer import RiskScorer
    from ai_core.risk_engine.scripts.zone_adjacency import compute_zone_adjacency_map
    from ai_core.shared.zone_config import Zone, load_zones_from_json
except ImportError:
    from panic_diffusion import PanicDiffusionModel
    from pre_event_simulator import PreEventSimulator
    from resource_allocator import ResourceAllocator
    from route_blockage_predictor import RouteBlockagePredictor
    from risk_scorer import RiskScorer
    from zone_adjacency import compute_zone_adjacency_map
    from shared.zone_config import Zone, load_zones_from_json


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _frame_zones(frame_json: dict[str, Any]) -> list[dict[str, Any]]:
    zones = frame_json.get("zones", [])
    return [zone for zone in zones if isinstance(zone, dict)]


class RiskEngine:
    """Compose the risk scoring, diffusion, allocation, and route prediction stages."""

    def __init__(self) -> None:
        self.scorer = RiskScorer()
        self.diffuser = PanicDiffusionModel()
        self.allocator = ResourceAllocator()
        self.route_predictor = RouteBlockagePredictor()
        self.pre_event_simulator = PreEventSimulator()

    def process_frame(
        self,
        cv_pipeline_frame_json: dict[str, Any],
        known_routes: list[dict[str, Any]] | None = None,
        diffusion_rate: float = 0.15,
        decay_rate: float = 0.05,
    ) -> dict[str, Any]:
        zones = _frame_zones(cv_pipeline_frame_json)
        adjacency_map = compute_zone_adjacency_map(zones)
        scored_frame = self.scorer.score_frame(cv_pipeline_frame_json)
        scored_zones = scored_frame.get("zones", [])

        current_zone_risk_scores = {
            str(zone.get("zone_id") or zone.get("id") or ""): _safe_float(zone.get("risk_score"))
            for zone in scored_zones
            if isinstance(zone, dict)
        }
        zone_crowd_counts = {
            str(zone.get("zone_id") or zone.get("id") or ""): int(zone.get("crowd_count", 0) or 0)
            for zone in zones
        }

        simulated_steps = self.diffuser.simulate_steps(
            current_zone_risk_scores=current_zone_risk_scores,
            zone_crowd_counts=zone_crowd_counts,
            adjacency_map=adjacency_map,
            diffusion_rate=diffusion_rate,
            decay_rate=decay_rate,
        )
        predicted_crush_timeline = self.diffuser.predict_crush_timeline(simulated_steps)

        resource_allocation_suggestions = self.allocator.suggest_allocations(
            scored_zones=scored_zones,
            adjacency_map=adjacency_map,
        )

        routes = known_routes if known_routes is not None else self.route_predictor.find_routes_to_exits(zones, adjacency_map)
        current_scored_zones = {
            str(zone.get("zone_id") or zone.get("id") or ""): zone for zone in scored_zones if isinstance(zone, dict)
        }
        route_blockage_predictions = self.route_predictor.predict_blockages(
            routes=routes,
            current_scored_zones=current_scored_zones,
            simulated_steps=simulated_steps,
        )

        return {
            "timestamp": cv_pipeline_frame_json.get("timestamp"),
            "zones": scored_zones,
            "panic_propagation": {"simulated_steps": simulated_steps},
            "predicted_crush_timeline": predicted_crush_timeline,
            "resource_allocation_suggestions": resource_allocation_suggestions,
            "route_blockage_predictions": route_blockage_predictions,
        }


def _load_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json_file(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the CrowdShield risk engine pipeline.")
    parser.add_argument("--input", required=True, help="Phase 1 output JSON file containing an array of frames.")
    parser.add_argument("--output", required=True, help="Destination JSON file for Phase 2 output.")
    parser.add_argument("--known-routes", help="Optional JSON file containing route definitions to reuse.")
    parser.add_argument("--pre-event", action="store_true", help="Run offline pre-event simulation instead of processing Phase 1 frames.")
    parser.add_argument("--zones-config", help="Zones config JSON file used with --pre-event.")
    parser.add_argument("--attendance", type=int, help="Expected attendance used with --pre-event.")
    parser.add_argument("--entry-zone-ids", nargs="*", default=None, help="Entry zone IDs used with --pre-event. Defaults to lowest-row zones when omitted.")
    parser.add_argument("--arrival-duration-minutes", type=int, default=30, help="Arrival duration used with --pre-event.")
    parser.add_argument("--num-steps", type=int, default=20, help="Number of simulation steps used with --pre-event.")
    return parser.parse_args()


def _resolve_entry_zone_ids(zones: list[Zone], provided_entry_zone_ids: list[str] | None) -> list[str]:
    if provided_entry_zone_ids:
        return [zone_id for zone_id in provided_entry_zone_ids if zone_id]

    if not zones:
        return []

    min_y = min(_safe_float(zone.bounds_normalized.get("y_min"), 0.0) for zone in zones if zone.bounds_normalized)
    return [
        zone.zone_id
        for zone in zones
        if zone.bounds_normalized and _safe_float(zone.bounds_normalized.get("y_min"), 0.0) == min_y
    ]


def _load_routes(path: Path) -> list[dict[str, Any]]:
    payload = _load_json_file(path)
    if isinstance(payload, list):
        return [route for route in payload if isinstance(route, dict)]
    raise ValueError("Known routes JSON must be a list of route objects.")


def main() -> None:
    args = _parse_args()
    output_path = Path(args.output)
    engine = RiskEngine()

    if args.pre_event:
        if not args.zones_config:
            raise SystemExit("--zones-config is required when using --pre-event.")
        if args.attendance is None:
            raise SystemExit("--attendance is required when using --pre-event.")

        zones = load_zones_from_json(args.zones_config)
        entry_zone_ids = _resolve_entry_zone_ids(zones, args.entry_zone_ids)
        adjacency_map = compute_zone_adjacency_map(zones)
        steps = engine.pre_event_simulator.simulate_arrival_buildup(
            zones=zones,
            entry_zone_ids=entry_zone_ids,
            expected_attendance=args.attendance,
            adjacency_map=adjacency_map,
            arrival_duration_minutes=args.arrival_duration_minutes,
            num_steps=args.num_steps,
        )
        _write_json_file(output_path, steps)
        return

    input_path = Path(args.input)
    frames = _load_json_file(input_path)
    if not isinstance(frames, list):
        raise SystemExit("Input Phase 1 JSON must be an array of frames.")

    known_routes = _load_routes(Path(args.known_routes)) if args.known_routes else None
    outputs = [
        engine.process_frame(frame, known_routes=known_routes)
        for frame in frames
        if isinstance(frame, dict)
    ]
    _write_json_file(output_path, outputs)


if __name__ == "__main__":
    main()
