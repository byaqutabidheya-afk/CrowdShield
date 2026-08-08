"""Route blockage prediction for CrowdShield safe-path planning."""

from __future__ import annotations

from collections import deque
import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
RISK_ENGINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = RISK_ENGINE_DIR.parent

if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


class RouteBlockagePredictor:
    """Infer routes to exits and estimate whether they are likely to be blocked."""

    def find_routes_to_exits(
        self,
        zones: list[dict[str, Any]],
        adjacency_map: dict[str, list[str]],
        custom_routes: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if custom_routes:
            normalized_routes: list[dict[str, Any]] = []
            for index, route in enumerate(custom_routes):
                route_dict = dict(route)
                zone_sequence = [
                    str(zone_id)
                    for zone_id in _safe_list(route_dict.get("zone_sequence"))
                ]
                if not zone_sequence:
                    continue

                route_id = str(
                    route_dict.get("route_id")
                    or route_dict.get("name")
                    or f"route_custom_{index + 1}"
                )
                route_dict["route_id"] = route_id
                route_dict["zone_sequence"] = zone_sequence
                normalized_routes.append(route_dict)
            return normalized_routes

        zone_lookup = {
            str(zone.get("zone_id") or zone.get("id") or ""): zone
            for zone in zones
            if isinstance(zone, dict)
        }
        exit_zone_ids = [
            zone_id
            for zone_id, zone in zone_lookup.items()
            if bool(zone.get("is_exit", False))
        ]

        routes: list[dict[str, Any]] = []
        for origin_zone_id, origin_zone in zone_lookup.items():
            if bool(origin_zone.get("is_exit", False)):
                continue

            path = self._shortest_path_to_exit(
                origin_zone_id, exit_zone_ids, adjacency_map
            )
            if not path:
                continue

            exit_zone_id = path[-1]
            routes.append(
                {
                    "route_id": f"route_{origin_zone_id}_to_{exit_zone_id}",
                    "origin_zone_id": origin_zone_id,
                    "exit_zone_id": exit_zone_id,
                    "zone_sequence": path,
                }
            )

        return routes

    def predict_blockages(
        self,
        routes: list[dict[str, Any]],
        current_scored_zones: dict[str, dict[str, Any]],
        simulated_steps: list[dict[str, Any]] | None = None,
        near_term_step_count: int = 3,
    ) -> list[dict[str, Any]]:
        predictions: list[dict[str, Any]] = []
        near_term_steps = (
            _safe_list(simulated_steps)[: max(0, near_term_step_count)]
            if simulated_steps
            else []
        )

        for route in routes:
            route_dict = dict(route)
            zone_sequence = [
                str(zone_id) for zone_id in _safe_list(route_dict.get("zone_sequence"))
            ]

            blocking_zone_id = None
            reason = None

            for zone_id in zone_sequence:
                current_zone = current_scored_zones.get(zone_id, {})
                if current_zone.get("risk_level") in {"high", "critical"}:
                    blocking_zone_id = zone_id
                    reason = "currently_high_risk"
                    break

            if blocking_zone_id is None and near_term_steps:
                for step in near_term_steps:
                    zone_risk_scores = step.get("zone_risk_scores", {})
                    for zone_id in zone_sequence:
                        if _safe_float(zone_risk_scores.get(zone_id, 0.0)) >= 0.55:
                            blocking_zone_id = zone_id
                            reason = "predicted_high_risk_within_simulation"
                            break
                    if blocking_zone_id is not None:
                        break

            route_dict.update(
                {
                    "at_risk_of_blockage": blocking_zone_id is not None,
                    "blocking_zone_id": blocking_zone_id,
                    "reason": reason,
                }
            )
            predictions.append(route_dict)

        return predictions

    def _shortest_path_to_exit(
        self,
        origin_zone_id: str,
        exit_zone_ids: list[str],
        adjacency_map: dict[str, list[str]],
    ) -> list[str]:
        if not exit_zone_ids:
            return [origin_zone_id]

        exit_set = set(exit_zone_ids)
        queue: deque[tuple[str, list[str]]] = deque(
            [(origin_zone_id, [origin_zone_id])]
        )
        visited = {origin_zone_id}

        while queue:
            zone_id, path = queue.popleft()
            if zone_id in exit_set and zone_id != origin_zone_id:
                return path

            for neighbor_id in adjacency_map.get(zone_id, []):
                if neighbor_id in visited:
                    continue
                visited.add(neighbor_id)
                next_path = path + [neighbor_id]
                if neighbor_id in exit_set:
                    return next_path
                queue.append((neighbor_id, next_path))

        return [origin_zone_id]
