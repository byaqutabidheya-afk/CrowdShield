"""Normalized zone-grid configuration helpers for CrowdShield."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _row_label(index: int) -> str:
    """Convert a zero-based row index to an Excel-style alphabetic label."""

    if index < 0:
        raise ValueError("Row index must be non-negative.")

    label = ""
    current = index
    while True:
        current, remainder = divmod(current, 26)
        label = chr(ord("A") + remainder) + label
        if current == 0:
            break
        current -= 1
    return label


def _validate_bounds(bounds_normalized: dict[str, float], allow_unnormalized: bool = False) -> dict[str, float]:
    if not bounds_normalized:
        return {}

    required_keys = {"x_min", "y_min", "x_max", "y_max"}
    missing_keys = required_keys.difference(bounds_normalized)
    if missing_keys:
        missing = ", ".join(sorted(missing_keys))
        raise ValueError(f"bounds_normalized is missing required keys: {missing}")

    normalized_bounds = {
        key: float(bounds_normalized[key])
        for key in ("x_min", "y_min", "x_max", "y_max")
    }
    x_min = normalized_bounds["x_min"]
    y_min = normalized_bounds["y_min"]
    x_max = normalized_bounds["x_max"]
    y_max = normalized_bounds["y_max"]

    if not allow_unnormalized:
        for key, value in normalized_bounds.items():
            if value < 0.0 or value > 1.0:
                raise ValueError(f"{key} must be between 0 and 1 inclusive.")

    if x_min >= x_max:
        raise ValueError("x_min must be less than x_max.")
    if y_min >= y_max:
        raise ValueError("y_min must be less than y_max.")

    return normalized_bounds


@dataclass(slots=True)
class Zone:
    zone_id: str = ""
    bounds_normalized: dict[str, float] = field(default_factory=dict)
    max_expected_count: int = 50
    adjacent_zone_ids: list[str] = field(default_factory=list)
    is_exit: bool = False
    polygon: list[tuple[float, float]] | list[list[float]] | None = None

    def __post_init__(self) -> None:
        if not self.bounds_normalized and self.polygon:
            xs = [float(p[0]) for p in self.polygon]
            ys = [float(p[1]) for p in self.polygon]
            self.bounds_normalized = {
                "x_min": min(xs),
                "y_min": min(ys),
                "x_max": max(xs),
                "y_max": max(ys),
            }
            self.bounds_normalized = _validate_bounds(self.bounds_normalized, allow_unnormalized=True)
        elif self.bounds_normalized:
            self.bounds_normalized = _validate_bounds(self.bounds_normalized)

        if self.max_expected_count <= 0:
            raise ValueError("max_expected_count must be greater than zero.")
        if not isinstance(self.adjacent_zone_ids, list):
            self.adjacent_zone_ids = list(self.adjacent_zone_ids)

    @property
    def id(self) -> str:
        return self.zone_id

    @id.setter
    def id(self, value: str) -> None:
        self.zone_id = value

    def to_dict(self) -> dict[str, Any]:
        res = {
            "zone_id": self.zone_id,
            "bounds_normalized": dict(self.bounds_normalized) if self.bounds_normalized else {},
            "max_expected_count": self.max_expected_count,
            "adjacent_zone_ids": list(self.adjacent_zone_ids),
            "is_exit": self.is_exit,
        }
        if self.polygon is not None:
            res["polygon"] = [list(p) for p in self.polygon]
        return res

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Zone":
        zone_id = str(data.get("zone_id") or data.get("id") or "")
        return cls(
            zone_id=zone_id,
            bounds_normalized=dict(data.get("bounds_normalized", {})) if data.get("bounds_normalized") else {},
            max_expected_count=int(data.get("max_expected_count", 50)),
            adjacent_zone_ids=list(data.get("adjacent_zone_ids", [])),
            is_exit=bool(data.get("is_exit", False)),
            polygon=data.get("polygon"),
        )

    def normalized_density(self, count: int) -> float:
        """Map a raw count onto a 0-1 density scale."""

        if count <= 0:
            return 0.0
        return min(1.0, count / float(self.max_expected_count))


def compute_grid_adjacency(
    rows: int, cols: int, include_diagonals: bool = False
) -> dict[str, list[str]]:
    """Compute orthogonal (and optionally diagonal) adjacent zone IDs for a grid layout."""

    if rows <= 0 or cols <= 0:
        raise ValueError("rows and cols must both be greater than zero.")

    adjacency: dict[str, list[str]] = {}
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if include_diagonals:
        directions.extend([(-1, -1), (-1, 1), (1, -1), (1, 1)])

    for row_index in range(rows):
        row_letter = _row_label(row_index)
        for col_index in range(cols):
            zone_id = f"zone_{row_letter}{col_index + 1}"
            neighbors: list[str] = []

            for dr, dc in directions:
                nr, nc = row_index + dr, col_index + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    n_row_letter = _row_label(nr)
                    neighbors.append(f"zone_{n_row_letter}{nc + 1}")

            adjacency[zone_id] = neighbors

    return adjacency


def generate_grid_zones(
    *args: Any,
    rows: int | None = None,
    cols: int | None = None,
    include_diagonals: bool = False,
    **kwargs: Any,
) -> list[Zone]:
    """Generate an evenly spaced grid of zones that covers the full frame with adjacency metadata.

    Supports multiple call signatures:
    - generate_grid_zones(rows, cols)
    - generate_grid_zones(rows, cols, include_diagonals)
    - generate_grid_zones(width, height, rows, cols)
    - generate_grid_zones(rows=3, cols=3)
    """

    if rows is None or cols is None:
        if len(args) == 2:
            rows, cols = int(args[0]), int(args[1])
        elif len(args) == 3:
            if isinstance(args[2], bool):
                rows, cols = int(args[0]), int(args[1])
                include_diagonals = args[2]
            else:
                rows, cols = int(args[0]), int(args[1])
        elif len(args) == 4:
            rows, cols = int(args[2]), int(args[3])
        elif "rows" in kwargs and "cols" in kwargs:
            rows, cols = int(kwargs["rows"]), int(kwargs["cols"])
        else:
            raise ValueError("generate_grid_zones requires rows and cols arguments.")

    if rows <= 0 or cols <= 0:
        raise ValueError("rows and cols must both be greater than zero.")

    adjacency_map = compute_grid_adjacency(rows, cols, include_diagonals=include_diagonals)
    zones: list[Zone] = []
    row_edges = [row_index / rows for row_index in range(rows + 1)]
    col_edges = [col_index / cols for col_index in range(cols + 1)]

    for row_index in range(rows):
        row_letter = _row_label(row_index)
        y_min = row_edges[row_index]
        y_max = row_edges[row_index + 1]

        for col_index in range(cols):
            x_min = col_edges[col_index]
            x_max = col_edges[col_index + 1]
            zone_id = f"zone_{row_letter}{col_index + 1}"
            zones.append(
                Zone(
                    zone_id=zone_id,
                    bounds_normalized={
                        "x_min": x_min,
                        "y_min": y_min,
                        "x_max": x_max,
                        "y_max": y_max,
                    },
                    adjacent_zone_ids=adjacency_map.get(zone_id, []),
                )
            )

    return zones


def load_zones_from_json(json_path: Path | str) -> list[Zone]:
    """Load zone definitions from a JSON file."""

    path = Path(json_path)
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, dict):
        zone_entries = payload.get("zones", [])
    elif isinstance(payload, list):
        zone_entries = payload
    else:
        raise ValueError(
            "Zone JSON must contain either a list or a mapping with a 'zones' key."
        )

    zones: list[Zone] = []
    for entry in zone_entries:
        if not isinstance(entry, dict):
            raise ValueError("Each zone entry must be a JSON object.")
        zones.append(Zone.from_dict(entry))

    return zones
