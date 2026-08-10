#!/usr/bin/env python3
"""Utility script for CrowdShield to prepare a Phase 2 (RiskEngine.process_frame)
output file to use as a test fixture for Phase 3 development.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Determine key directory paths
SCRIPT_DIR = Path(__file__).resolve().parent
GENAI_PIPELINE_DIR = SCRIPT_DIR.parent
AI_CORE_DIR = GENAI_PIPELINE_DIR.parent
RISK_ENGINE_DIR = AI_CORE_DIR / "risk_engine"
RISK_ENGINE_SCRIPTS_DIR = RISK_ENGINE_DIR / "scripts"
CV_PIPELINE_DIR = AI_CORE_DIR / "cv_pipeline"
FIXTURES_DIR = GENAI_PIPELINE_DIR / "fixtures"
DEFAULT_FIXTURE_PATH = FIXTURES_DIR / "phase2_sample_output.json"

# Add required paths for importing RiskEngine
if str(RISK_ENGINE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(RISK_ENGINE_SCRIPTS_DIR))
if str(AI_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_CORE_DIR))

try:
    from pipeline import RiskEngine
except ImportError as exc:
    print(f"Warning: Unable to import RiskEngine directly ({exc}).", file=sys.stderr)
    RiskEngine = None


def is_valid_phase1_frame(data: Any) -> bool:
    """Check if data matches Phase 1 frame schema with zones and bounds."""
    if not isinstance(data, dict):
        return False
    zones = data.get("zones")
    if not isinstance(zones, list) or len(zones) == 0:
        return False
    for zone in zones:
        if isinstance(zone, dict) and "bounds_normalized" in zone:
            return True
    return False


def find_phase1_files(search_dir: Path) -> list[Path]:
    """Recursively search search_dir for JSON files containing Phase 1 output."""
    if not search_dir.exists():
        return []

    candidates: list[Path] = []
    if search_dir.is_file():
        json_files = [search_dir]
    else:
        json_files = sorted(search_dir.rglob("*.json"))

    for json_path in json_files:
        # Exclude genai_pipeline fixtures directory
        if "fixtures" in json_path.parts:
            continue
        try:
            with json_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if is_valid_phase1_frame(data):
                candidates.append(json_path)
            elif isinstance(data, list) and len(data) > 0:
                if any(is_valid_phase1_frame(item) for item in data if isinstance(item, dict)):
                    candidates.append(json_path)
        except Exception:
            continue

    return sorted(candidates)


def load_phase1_frames(json_files: list[Path]) -> list[dict[str, Any]]:
    """Load all frame objects from the given list of Phase 1 JSON files."""
    frames: list[dict[str, Any]] = []
    for filepath in json_files:
        try:
            with filepath.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if is_valid_phase1_frame(data):
                frames.append(data)
            elif isinstance(data, list):
                for item in data:
                    if is_valid_phase1_frame(item):
                        frames.append(item)
        except Exception:
            continue
    return frames


def validate_fixture(
    data: Any,
) -> tuple[bool, dict[str, Any] | None, list[dict[str, Any]]]:
    """Validate if data qualifies as a good Phase 2 test fixture.

    Requirements:
    1. At least 2 zones total.
    2. At least 1 zone with risk_level in ["high", "critical"].

    Returns:
        (is_valid, qualifying_frame_dict, high_critical_zones)
    """
    if isinstance(data, list):
        for frame in data:
            if isinstance(frame, dict):
                is_valid, frame_dict, high_crit = validate_fixture(frame)
                if is_valid:
                    return True, frame_dict, high_crit
        return False, None, []

    if not isinstance(data, dict):
        return False, None, []

    zones = data.get("zones", [])
    if not isinstance(zones, list) or len(zones) < 2:
        return False, None, []

    high_critical_zones = [
        zone
        for zone in zones
        if isinstance(zone, dict)
        and zone.get("risk_level") in ("high", "critical")
    ]

    if len(high_critical_zones) >= 1:
        return True, data, high_critical_zones

    return False, None, []


def find_max_risk_score(
    phase2_outputs: list[dict[str, Any]],
) -> tuple[float, str, str]:
    """Find the maximum risk_score seen across all frames and zones."""
    max_score = 0.0
    max_zone = "N/A"
    max_ts = "N/A"

    for frame in phase2_outputs:
        ts = str(frame.get("timestamp", "N/A"))
        for zone in frame.get("zones", []):
            if isinstance(zone, dict):
                score = float(zone.get("risk_score", 0.0) or 0.0)
                if score >= max_score:
                    max_score = score
                    max_zone = str(zone.get("zone_id") or zone.get("id") or "N/A")
                    max_ts = ts

    return max_score, max_zone, max_ts


def generate_synthetic_fixture() -> dict[str, Any]:
    """Construct a synthetic Phase 2 output matching schema with high/critical risk."""
    if RiskEngine is not None:
        engine = RiskEngine()
        # Pre-seed history for zone_A1 to boost density_rate_of_change
        engine.scorer.compute_density_rate_of_change("zone_A1", 0.0)

        synthetic_phase1_frame = {
            "timestamp": "2026-08-09T00:00:00Z",
            "frame_number": 0,
            "source_id": "synthetic_demo_source",
            "zones": [
                {
                    "zone_id": "zone_A1",
                    "bounds_normalized": {
                        "x_min": 0.0,
                        "y_min": 0.0,
                        "x_max": 0.5,
                        "y_max": 1.0,
                    },
                    "crowd_count": 120,
                    "density_score": 0.95,
                    "avg_flow_speed": 0.90,
                    "avg_flow_direction_deg": 90.0,
                    "bottleneck_detected": True,
                    "anomaly_flags": ["sudden_surge", "overcrowding"],
                },
                {
                    "zone_id": "zone_A2",
                    "bounds_normalized": {
                        "x_min": 0.5,
                        "y_min": 0.0,
                        "x_max": 1.0,
                        "y_max": 1.0,
                    },
                    "crowd_count": 15,
                    "density_score": 0.20,
                    "avg_flow_speed": 0.20,
                    "avg_flow_direction_deg": 270.0,
                    "bottleneck_detected": False,
                    "anomaly_flags": [],
                },
            ],
        }
        res = engine.process_frame(synthetic_phase1_frame)
        res["synthetic"] = True
        return res
    else:
        # Fallback raw dict if RiskEngine cannot be imported
        return {
            "synthetic": True,
            "timestamp": "2026-08-09T00:00:00Z",
            "zones": [
                {
                    "zone_id": "zone_A1",
                    "risk_score": 0.85,
                    "risk_level": "critical",
                    "contributing_factors": {
                        "density_score": 0.95,
                        "density_rate_of_change": 0.50,
                        "flow_convergence_score": 1.0,
                        "bottleneck_score": 1.0,
                        "anomaly_score": 0.333,
                        "weights": {
                            "density": 0.35,
                            "rate": 0.25,
                            "convergence": 0.20,
                            "bottleneck": 0.15,
                            "anomaly": 0.05,
                        },
                        "weighted_components": {
                            "density": 0.3325,
                            "rate": 0.125,
                            "convergence": 0.20,
                            "bottleneck": 0.15,
                            "anomaly": 0.0167,
                        },
                    },
                },
                {
                    "zone_id": "zone_A2",
                    "risk_score": 0.15,
                    "risk_level": "low",
                    "contributing_factors": {
                        "density_score": 0.20,
                        "density_rate_of_change": 0.0,
                        "flow_convergence_score": 0.0,
                        "bottleneck_score": 0.0,
                        "anomaly_score": 0.0,
                        "weights": {
                            "density": 0.35,
                            "rate": 0.25,
                            "convergence": 0.20,
                            "bottleneck": 0.15,
                            "anomaly": 0.05,
                        },
                        "weighted_components": {
                            "density": 0.07,
                            "rate": 0.0,
                            "convergence": 0.0,
                            "bottleneck": 0.0,
                            "anomaly": 0.0,
                        },
                    },
                },
            ],
            "panic_propagation": {"simulated_steps": []},
            "predicted_crush_timeline": [],
            "resource_allocation_suggestions": [],
            "route_blockage_predictions": [],
        }


def print_summary(
    fixture_path: Path,
    data: dict[str, Any],
    high_crit_zones: list[dict[str, Any]],
) -> None:
    """Print a short summary of the test fixture."""
    zones = data.get("zones", [])
    rel_path = fixture_path
    try:
        rel_path = fixture_path.relative_to(AI_CORE_DIR.parent)
    except ValueError:
        pass

    print("=" * 65)
    print("PHASE 2 TEST FIXTURE SUMMARY")
    print("=" * 65)
    print(f"Fixture File: {rel_path}")
    print(f"Timestamp:    {data.get('timestamp', 'N/A')}")
    print(f"Total Zones:  {len(zones)}")
    print(f"Synthetic:    {data.get('synthetic', False)}")
    print("-" * 65)
    print("High/Critical Risk Zones:")
    for zone in high_crit_zones:
        zid = zone.get("zone_id") or zone.get("id") or "N/A"
        rlevel = str(zone.get("risk_level", "N/A")).upper()
        rscore = float(zone.get("risk_score", 0.0) or 0.0)

        factors = zone.get("contributing_factors", {})
        weighted_comp = factors.get("weighted_components", {})

        if weighted_comp and isinstance(weighted_comp, dict):
            dominant_factor = max(weighted_comp, key=weighted_comp.get)
            dominant_weighted = weighted_comp[dominant_factor]
            raw_key = f"{dominant_factor}_score"
            raw_val = factors.get(raw_key, factors.get(dominant_factor, "N/A"))
            dom_str = (
                f"{dominant_factor} (weighted: {dominant_weighted:.3f}, raw: {raw_val})"
            )
        else:
            dom_str = "N/A"

        print(f"  • Zone [{zid}]: Risk Level = {rlevel}, Risk Score = {rscore:.3f}")
        print(f"    Dominant Contributing Factor: {dom_str}")
    print("=" * 65)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare a Phase 2 output file as a test fixture for Phase 3."
    )
    parser.add_argument(
        "--fixture-path",
        type=Path,
        default=DEFAULT_FIXTURE_PATH,
        help=f"Destination fixture JSON file (default: {DEFAULT_FIXTURE_PATH})",
    )
    parser.add_argument(
        "--source-path",
        type=Path,
        default=None,
        help="Optional explicit path to Phase 1 JSON file or directory (default: ai-core/cv_pipeline/)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force regeneration of the fixture even if a valid file exists.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    fixture_path: Path = args.fixture_path
    force: bool = args.force

    # Ensure output directory exists
    fixture_path.parent.mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------------------
    # 1. CHECK FOR EXISTING OUTPUT
    # -------------------------------------------------------------------------
    if not force and fixture_path.exists():
        try:
            with fixture_path.open("r", encoding="utf-8") as f:
                existing_data = json.load(f)
            is_valid, valid_frame, high_crit_zones = validate_fixture(existing_data)
            if is_valid and valid_frame is not None:
                print(
                    f"Existing fixture found at {fixture_path} and validated successfully."
                )
                print_summary(fixture_path, valid_frame, high_crit_zones)
                sys.exit(0)
            else:
                print(
                    f"Existing fixture at {fixture_path} does not meet requirements (needs >=2 zones, >=1 high/critical zone). Regenerating...",
                    file=sys.stderr,
                )
        except Exception as exc:
            print(
                f"Error reading existing fixture at {fixture_path}: {exc}. Regenerating...",
                file=sys.stderr,
            )

    # -------------------------------------------------------------------------
    # 2. LOCATE A PHASE 1 SOURCE
    # -------------------------------------------------------------------------
    search_dir = args.source_path if args.source_path else CV_PIPELINE_DIR
    phase1_files = find_phase1_files(search_dir)

    if not phase1_files:
        sample_video = CV_PIPELINE_DIR / "sample_videos" / "surge.mp4"
        phase1_script = CV_PIPELINE_DIR / "scripts" / "pipeline.py"
        print("=" * 65, file=sys.stderr)
        print("ERROR: No Phase 1 output JSON found in cv_pipeline!", file=sys.stderr)
        print("=" * 65, file=sys.stderr)
        print(
            "Please run the Phase 1 CV pipeline first on a sample video to generate Phase 1 output.",
            file=sys.stderr,
        )
        print(f"  Phase 1 script: {phase1_script}", file=sys.stderr)
        print(f"  Sample video:   {sample_video}", file=sys.stderr)
        print("\nExample command to generate Phase 1 output:", file=sys.stderr)
        print(
            f"  python {phase1_script} --video {sample_video} --zones 3x3 --output {CV_PIPELINE_DIR / 'output' / 'phase1_output.json'}",
            file=sys.stderr,
        )
        print("=" * 65, file=sys.stderr)
        sys.exit(1)

    print(f"Located Phase 1 source file(s): {[str(p) for p in phase1_files]}")

    # -------------------------------------------------------------------------
    # 3. RUN THE PHASE 2 PIPELINE
    # -------------------------------------------------------------------------
    phase1_frames = load_phase1_frames(phase1_files)
    if not phase1_frames:
        print(
            "ERROR: Phase 1 JSON files were found but contained no valid frames.",
            file=sys.stderr,
        )
        sys.exit(1)

    if RiskEngine is None:
        print(
            "ERROR: RiskEngine module could not be imported to run Phase 2 pipeline.",
            file=sys.stderr,
        )
        sys.exit(1)

    engine = RiskEngine()
    phase2_outputs: list[dict[str, Any]] = [
        engine.process_frame(frame) for frame in phase1_frames if isinstance(frame, dict)
    ]

    # -------------------------------------------------------------------------
    # 4. VALIDATE THE OUTPUT QUALIFIES AS A GOOD TEST FIXTURE
    # -------------------------------------------------------------------------
    is_valid, qualifying_frame, high_crit_zones = validate_fixture(phase2_outputs)

    if is_valid and qualifying_frame is not None:
        # Write qualifying frame to fixture path
        with fixture_path.open("w", encoding="utf-8") as f:
            json.dump(qualifying_frame, f, indent=2)
            f.write("\n")
        print(f"Successfully generated and saved Phase 2 fixture to {fixture_path}")
        print_summary(fixture_path, qualifying_frame, high_crit_zones)
        sys.exit(0)
    else:
        # 4b. Fallback when demo footage never crosses the risk threshold
        max_score, max_zone, max_ts = find_max_risk_score(phase2_outputs)
        print("=" * 65, file=sys.stderr)
        print("WARNING: Phase 1 data processed, but no frame reached 'high' or 'critical' risk level.", file=sys.stderr)
        print(f"  • Maximum risk_score seen across all frames: {max_score:.3f} (in Zone '{max_zone}' at timestamp '{max_ts}')", file=sys.stderr)
        print("\nTo resolve this for testing, you have two options:", file=sys.stderr)
        print("  Option (i):  Lower risk_score thresholds temporarily via RiskScorer configurable weights for testing.", file=sys.stderr)
        print("  Option (ii): Construct a hand-crafted synthetic zone dict matching Phase 2 schema with manually set high-density/high-convergence bottleneck zone.", file=sys.stderr)
        print("\nApplying Option (ii) fallback: Generating synthetic test fixture labeled with 'synthetic': true...", file=sys.stderr)
        print("=" * 65, file=sys.stderr)

        synthetic_fixture = generate_synthetic_fixture()
        _, valid_synth_frame, synth_high_crit = validate_fixture(synthetic_fixture)

        with fixture_path.open("w", encoding="utf-8") as f:
            json.dump(synthetic_fixture, f, indent=2)
            f.write("\n")

        print(f"Successfully generated and saved synthetic Phase 2 fixture to {fixture_path}")
        if valid_synth_frame is not None:
            print_summary(fixture_path, valid_synth_frame, synth_high_crit)
        sys.exit(0)


if __name__ == "__main__":
    main()
