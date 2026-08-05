"""Normalized zone-grid configuration helpers for the CV pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass
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


def _validate_bounds(bounds_normalized: dict[str, float]) -> dict[str, float]:
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
    zone_id: str
    bounds_normalized: dict[str, float]
    max_expected_count: int = 50

    def __post_init__(self) -> None:
        self.bounds_normalized = _validate_bounds(self.bounds_normalized)
        if self.max_expected_count <= 0:
            raise ValueError("max_expected_count must be greater than zero.")

    def to_dict(self) -> dict[str, Any]:
        return {
            "zone_id": self.zone_id,
            "bounds_normalized": dict(self.bounds_normalized),
            "max_expected_count": self.max_expected_count,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Zone":
        return cls(
            zone_id=str(data["zone_id"]),
            bounds_normalized=dict(data["bounds_normalized"]),
            max_expected_count=int(data.get("max_expected_count", 50)),
        )

    def normalized_density(self, count: int) -> float:
        """Map a raw count onto a 0-1 density scale."""

        if count <= 0:
            return 0.0
        return min(1.0, count / float(self.max_expected_count))


def generate_grid_zones(rows: int, cols: int) -> list[Zone]:
    """Generate an evenly spaced grid of zones that covers the full frame."""

    if rows <= 0 or cols <= 0:
        raise ValueError("rows and cols must both be greater than zero.")

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
            zones.append(
                Zone(
                    zone_id=f"zone_{row_letter}{col_index + 1}",
                    bounds_normalized={
                        "x_min": x_min,
                        "y_min": y_min,
                        "x_max": x_max,
                        "y_max": y_max,
                    },
                )
            )

    return zones


def load_zones_from_json(json_path: Path | str) -> list[Zone]:
    """Load zone definitions from a JSON file.

    The file can contain either a top-level list of zone objects or a mapping
    with a ``zones`` key.
    """

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
