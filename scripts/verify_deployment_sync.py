#!/usr/bin/env python3
"""
verify_deployment_sync.py — Standalone Deployment Sync Verification Script for CrowdShield

Verifies end-to-end data flow:
1. Starts local video processing pipeline (http://localhost:8000).
2. Local orchestrator writes crowd metrics asynchronously to Supabase.
3. Queries deployed backend on Render (https://crowdshield-1-5ty6.onrender.com)
   to confirm data persistence and cross-environment sync.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Load python-dotenv if present
try:
    from dotenv import load_dotenv

    # Search for root .env or backend/.env
    repo_root = Path(__file__).resolve().parent.parent
    if (repo_root / ".env").exists():
        load_dotenv(repo_root / ".env")
    if (repo_root / "backend" / ".env").exists():
        load_dotenv(repo_root / "backend" / ".env")
except ImportError:
    pass

import requests


def get_default_3x3_zones() -> list[dict]:
    """
    Generate default 3x3 grid zone configurations (zone_A1 to zone_C3).
    Reuses standard zone bounds structure from ai_core shared zone_config.
    """
    try:
        from ai_core.shared.zone_config import generate_grid_zones

        return [z.to_dict() for z in generate_grid_zones(3, 3)]
    except ImportError:
        # Fallback 3x3 grid definition if ai_core module not directly importable
        zones = []
        rows, cols = 3, 3
        row_labels = ["A", "B", "C"]
        for r_idx in range(rows):
            r_label = row_labels[r_idx]
            y_min = round(r_idx / rows, 3)
            y_max = round((r_idx + 1) / rows, 3)
            for c_idx in range(cols):
                x_min = round(c_idx / cols, 3)
                x_max = round((c_idx + 1) / cols, 3)
                z_id = f"zone_{r_label}{c_idx + 1}"
                zones.append(
                    {
                        "zone_id": z_id,
                        "bounds_normalized": {
                            "x_min": x_min,
                            "y_min": y_min,
                            "x_max": x_max,
                            "y_max": y_max,
                        },
                        "max_expected_count": 50,
                        "adjacent_zone_ids": [],
                        "is_exit": False,
                    }
                )
        return zones


def resolve_local_url() -> str:
    """Resolve local backend HTTP base URL from environment variables."""
    port = os.getenv("BACKEND_PORT", "8000")
    url = os.getenv("BACKEND_HTTP_URL", f"http://localhost:{port}")
    return url.rstrip("/")


def main():
    parser = argparse.ArgumentParser(
        description="Verify local CrowdShield processing sync with deployed Render backend via Supabase."
    )
    parser.add_argument(
        "--video",
        type=str,
        default="ai_core/cv_pipeline/sample_videos/baseline.mp4",
        help="Path to sample video file for live processing",
    )
    parser.add_argument(
        "--venue-id",
        type=str,
        default="test_venue",
        help="Venue ID string for processing run",
    )
    parser.add_argument(
        "--zone-id",
        type=str,
        default="zone_A1",
        help="Target zone ID for verification query",
    )
    parser.add_argument(
        "--local-url",
        type=str,
        default=resolve_local_url(),
        help="Local backend base HTTP URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--deployed-url",
        type=str,
        default="https://crowdshield-1-5ty6.onrender.com",
        help="Deployed backend base HTTP URL",
    )

    args = parser.parse_args()

    local_url = args.local_url.rstrip("/")
    deployed_url = args.deployed_url.rstrip("/")

    # Resolve video path to absolute path so backend can open it regardless of CWD
    video_path = Path(args.video)
    if not video_path.is_absolute():
        repo_root = Path(__file__).resolve().parent.parent
        candidate_root = repo_root / video_path
        if candidate_root.exists():
            video_path = candidate_root.resolve()
        else:
            video_path = video_path.resolve()

    if not video_path.exists():
        print(f"❌ FAIL: Sample video file does not exist at: {video_path}")
        print("Please specify a valid sample video using --video <path_to_mp4>.")
        sys.exit(1)

    video_source_str = str(video_path)

    print("=" * 70)
    print("  CrowdShield Deployment Sync Verification")
    print("=" * 70)
    print(f"  Local Backend URL    : {local_url}")
    print(f"  Deployed Backend URL : {deployed_url}")
    print(f"  Video Source (Abs)   : {video_source_str}")
    print(f"  Venue ID             : {args.venue_id}")
    print(f"  Target Zone ID       : {args.zone_id}")
    print("-" * 70)

    # STEP 1: Record start_time ISO timestamp
    start_time_dt = datetime.now(timezone.utc)
    start_time_iso = start_time_dt.isoformat()
    print(f"\n[STEP 1] Recorded test start_time (UTC): {start_time_iso}")

    # STEP 2: Upsert zones & POST /api/processing/start to local backend
    print(f"\n[STEP 2] Upserting zone configuration & launching processing loop on local backend ({local_url})...")
    zones_config = get_default_3x3_zones()
    zones_endpoint = f"{local_url}/api/zones"

    # Add venue_id to zone dicts for DB upsert
    db_zones_payload = []
    for z in zones_config:
        zd = dict(z)
        zd["venue_id"] = args.venue_id
        db_zones_payload.append(zd)

    try:
        z_res = requests.post(zones_endpoint, json=db_zones_payload, timeout=5)
        print(f"  - Seeded zones table: HTTP {z_res.status_code}")
    except Exception as exc:
        print(f"  - Warning seeding zones table: {exc}")

    start_endpoint = f"{local_url}/api/processing/start"
    payload = {
        "video_source": video_source_str,
        "zones_config": db_zones_payload,
        "venue_id": args.venue_id,
        "sample_every_n_frames": 1,
    }

    try:
        start_res = requests.post(start_endpoint, json=payload, timeout=10)
        if start_res.status_code != 200:
            print(f"\n❌ FAIL: Step 2 failed. HTTP {start_res.status_code}: {start_res.text}")
            print("Reason: Could not start processing loop on local backend.")
            sys.exit(1)

        start_data = start_res.json()
        session_id = start_data.get("session_id", "unknown")
        print(f"  - Status Response : {start_data.get('status')}")
        print(f"  - Session ID      : {session_id}")

    except Exception as exc:
        print(f"\n❌ FAIL: Step 2 failed to connect to local backend at {start_endpoint}.")
        print(f"Reason: {exc}")
        print("Ensure local backend is running (e.g. uvicorn app.main:app --port 8000).")
        sys.exit(1)

    # STEP 3: Poll /api/processing/status every 2 seconds for up to 60 seconds
    print(f"\n[STEP 3] Polling local processing status every 2 seconds...")
    status_endpoint = f"{local_url}/api/processing/status"
    max_poll_seconds = 60
    poll_interval = 2
    elapsed = 0
    prev_frames = -1
    stagnant_count = 0

    while elapsed < max_poll_seconds:
        time.sleep(poll_interval)
        elapsed += poll_interval

        try:
            status_res = requests.get(status_endpoint, timeout=5)
            if status_res.status_code == 200:
                s_data = status_res.json()
                curr_frames = s_data.get("frames_processed", 0)
                is_active = s_data.get("is_active", False)

                print(
                    f"  - Poll [{elapsed:02d}s]: frames_processed={curr_frames}, is_active={is_active}"
                )

                if not is_active:
                    print("  - Live processing task finished on local backend.")
                    if curr_frames == 0:
                        print("\n❌ FAIL: Local processing loop finished with 0 frames processed!")
                        print("Reason: OpenCV/CVPipeline could not open the video file or encountered an exception.")
                        print("Troubleshooting: Check local backend console logs for exception tracebacks.")
                        sys.exit(1)
                    break

                if curr_frames == prev_frames:
                    stagnant_count += 1
                    if stagnant_count >= 3:
                        print(
                            "  - frames_processed stopped increasing for 3 consecutive polls. Treating as done."
                        )
                        break
                else:
                    stagnant_count = 0
                    prev_frames = curr_frames
        except Exception as exc:
            print(f"  - Warning during status polling: {exc}")

    # STEP 4: Call /api/processing/stop to ensure clean termination
    print(f"\n[STEP 4] Stopping local processing task cleanly...")
    stop_endpoint = f"{local_url}/api/processing/stop"
    try:
        stop_res = requests.post(stop_endpoint, timeout=5)
        print(f"  - Stop API Response: {stop_res.json()}")
    except Exception as exc:
        print(f"  - Warning: Stop endpoint returned exception: {exc}")

    # STEP 5: Wait 3 seconds for pending async Supabase writes to flush
    print(f"\n[STEP 5] Waiting 3 seconds for async Supabase metric writes to complete...")
    time.sleep(3)

    # STEP 6: GET {deployed-url}/api/trends/{zone-id}
    end_time_iso = datetime.now(timezone.utc).isoformat()
    print(f"\n[STEP 6] Querying deployed backend on Render ({deployed_url})...")
    trends_endpoint = f"{deployed_url}/api/trends/{args.zone_id}"
    params = {
        "start_time": start_time_iso,
        "end_time": end_time_iso,
    }
    print(f"  - Endpoint URL : {trends_endpoint}")
    print(f"  - Start Time   : {start_time_iso}")
    print(f"  - End Time     : {end_time_iso}")

    try:
        trends_res = requests.get(trends_endpoint, params=params, timeout=15)
        if trends_res.status_code != 200:
            print(
                f"\n❌ FAIL: Deployed backend returned HTTP {trends_res.status_code}: {trends_res.text}"
            )
            print("Reason: Deployed backend endpoint failed to respond with HTTP 200 OK.")
            sys.exit(1)

        trends_data = trends_res.json()

        # STEP 7: Validate response payload & print sample points
        print(f"\n[STEP 7] Validating trend points returned by deployed backend...")

        if not isinstance(trends_data, list) or len(trends_data) == 0:
            print(f"\n❌ FAIL: Deployed backend returned no trend points for zone '{args.zone_id}'.")
            print(
                "Reason: No rows appeared in Supabase during the test window, or deployed backend could not read them."
            )
            sys.exit(1)

        total_points = len(trends_data)
        first_p = trends_data[0]
        last_p = trends_data[-1]

        print(f"  - Total Trend Points Returned : {total_points}")
        print(
            f"  - First Point                 : timestamp={first_p.get('timestamp')}, "
            f"density_score={first_p.get('density_score')}, risk_score={first_p.get('risk_score')}"
        )
        print(
            f"  - Last Point                  : timestamp={last_p.get('timestamp')}, "
            f"density_score={last_p.get('density_score')}, risk_score={last_p.get('risk_score')}"
        )

        # STEP 8: Final PASS/FAIL evaluation
        print("\n" + "=" * 70)
        print("✅ PASS: Local video processing metrics were written to Supabase and")
        print("        successfully queried back from the deployed Render backend!")
        print("=" * 70)
        sys.exit(0)

    except Exception as exc:
        print(f"\n❌ FAIL: Failed to query deployed backend: {exc}")
        print("Reason: Network timeout or unreachable deployed server URL.")
        sys.exit(1)


if __name__ == "__main__":
    main()
