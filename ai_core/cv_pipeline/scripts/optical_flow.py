"""Dense optical-flow analysis for the CrowdShield CV pipeline."""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np


CURRENT_DIR = Path(__file__).resolve().parent
CV_PIPELINE_DIR = CURRENT_DIR.parent
AI_CORE_DIR = CV_PIPELINE_DIR.parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))
if str(CV_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(CV_PIPELINE_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

try:
    from ai_core.shared.zone_config import Zone
except ImportError:
    from shared.zone_config import Zone


class OpticalFlowAnalyzer:
    """Compute dense optical flow and summarize it within normalized zones."""

    max_expected_speed: float = 10.0

    def __init__(
        self,
        pyr_scale: float = 0.5,
        levels: int = 3,
        winsize: int = 15,
        iterations: int = 3,
        poly_n: int = 5,
        poly_sigma: float = 1.2,
        flags: int = 0,
    ) -> None:
        self.farneback_params = {
            "pyr_scale": pyr_scale,
            "levels": levels,
            "winsize": winsize,
            "iterations": iterations,
            "poly_n": poly_n,
            "poly_sigma": poly_sigma,
            "flags": flags,
        }

    def compute_flow(self, prev_gray: np.ndarray, next_gray: np.ndarray) -> np.ndarray:
        """Compute dense optical flow between two consecutive grayscale frames."""

        if prev_gray is None or next_gray is None:
            raise ValueError("prev_gray and next_gray must not be None.")

        if prev_gray.ndim != 2 or next_gray.ndim != 2:
            raise ValueError("prev_gray and next_gray must be grayscale frames.")

        if prev_gray.shape != next_gray.shape:
            raise ValueError("prev_gray and next_gray must have the same shape.")

        prev = prev_gray.astype(np.uint8, copy=False)
        nxt = next_gray.astype(np.uint8, copy=False)
        return cv2.calcOpticalFlowFarneback(prev, nxt, None, **self.farneback_params)

    def compute_zone_flow(
        self,
        flow_field: np.ndarray,
        zone: Zone,
        frame_width: int,
        frame_height: int,
    ) -> dict[str, Any]:
        """Summarize flow speed and direction within a zone."""

        if flow_field is None:
            raise ValueError("flow_field must not be None.")
        if flow_field.ndim != 3 or flow_field.shape[-1] != 2:
            raise ValueError("flow_field must have shape (height, width, 2).")
        if frame_width <= 0 or frame_height <= 0:
            raise ValueError(
                "frame_width and frame_height must both be greater than zero."
            )

        x_min = max(
            0,
            min(
                frame_width,
                int(math.floor(zone.bounds_normalized["x_min"] * frame_width)),
            ),
        )
        y_min = max(
            0,
            min(
                frame_height,
                int(math.floor(zone.bounds_normalized["y_min"] * frame_height)),
            ),
        )
        x_max = max(
            0,
            min(
                frame_width,
                int(math.ceil(zone.bounds_normalized["x_max"] * frame_width)),
            ),
        )
        y_max = max(
            0,
            min(
                frame_height,
                int(math.ceil(zone.bounds_normalized["y_max"] * frame_height)),
            ),
        )

        if x_max <= x_min or y_max <= y_min:
            return {
                "avg_flow_speed": 0.0,
                "avg_flow_direction_deg": 0.0,
                "avg_flow_direction_label": "N",
            }

        zone_flow = flow_field[y_min:y_max, x_min:x_max]
        if zone_flow.size == 0:
            return {
                "avg_flow_speed": 0.0,
                "avg_flow_direction_deg": 0.0,
                "avg_flow_direction_label": "N",
            }

        fx = zone_flow[..., 0]
        fy = zone_flow[..., 1]
        magnitudes = np.sqrt(fx * fx + fy * fy)
        avg_speed = float(np.mean(magnitudes))
        normalized_speed = min(avg_speed / float(self.max_expected_speed), 1.0)

        mean_fx = float(np.mean(fx))
        mean_fy = float(np.mean(fy))
        direction_deg = (math.degrees(math.atan2(mean_fx, -mean_fy)) + 360.0) % 360.0

        return {
            "avg_flow_speed": normalized_speed,
            "avg_flow_direction_deg": direction_deg,
            "avg_flow_direction_label": self._direction_label(direction_deg),
        }

    @staticmethod
    def _direction_label(direction_deg: float) -> str:
        """Map a compass heading in degrees to an 8-way label."""

        compass_labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        sector = int(((direction_deg + 22.5) % 360.0) // 45.0)
        return compass_labels[sector]

    def compute_zone_raw_flow(
        self,
        flow_field: np.ndarray,
        zone: Zone,
        frame_width: int,
        frame_height: int,
    ) -> dict[str, float]:
        """Return raw (un-normalised) flow speed and spatial variance for a zone.

        Unlike :meth:`compute_zone_flow`, the speed here is in pixels-per-frame
        with no normalisation applied.  This gives the flow-only bottleneck detector
        stable, physics-grounded thresholds that are independent of the
        ``max_expected_speed`` parameter.

        Returns a dict with keys:
        - ``raw_avg_speed``: mean magnitude of flow vectors (px/frame).
        - ``flow_spatial_variance``: sum of per-component spatial variance
          (``Var(fx) + Var(fy)``).  High values indicate chaotic / incoherent
          flow, which is the hallmark of crowd compression.
        """

        if flow_field is None:
            raise ValueError("flow_field must not be None.")
        if flow_field.ndim != 3 or flow_field.shape[-1] != 2:
            raise ValueError("flow_field must have shape (height, width, 2).")
        if frame_width <= 0 or frame_height <= 0:
            raise ValueError(
                "frame_width and frame_height must both be greater than zero."
            )

        x_min = max(
            0,
            min(
                frame_width,
                int(math.floor(zone.bounds_normalized["x_min"] * frame_width)),
            ),
        )
        y_min = max(
            0,
            min(
                frame_height,
                int(math.floor(zone.bounds_normalized["y_min"] * frame_height)),
            ),
        )
        x_max = max(
            0,
            min(
                frame_width,
                int(math.ceil(zone.bounds_normalized["x_max"] * frame_width)),
            ),
        )
        y_max = max(
            0,
            min(
                frame_height,
                int(math.ceil(zone.bounds_normalized["y_max"] * frame_height)),
            ),
        )

        if x_max <= x_min or y_max <= y_min or flow_field.size == 0:
            return {"raw_avg_speed": 0.0, "flow_spatial_variance": 0.0}

        zone_flow = flow_field[y_min:y_max, x_min:x_max]
        if zone_flow.size == 0:
            return {"raw_avg_speed": 0.0, "flow_spatial_variance": 0.0}

        fx = zone_flow[..., 0]
        fy = zone_flow[..., 1]
        magnitudes = np.sqrt(fx * fx + fy * fy)
        raw_avg_speed = float(np.mean(magnitudes))
        flow_spatial_variance = float(np.var(fx) + np.var(fy))

        return {
            "raw_avg_speed": raw_avg_speed,
            "flow_spatial_variance": flow_spatial_variance,
        }
