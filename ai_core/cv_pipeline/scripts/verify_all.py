import sys
import time
from pathlib import Path

sys.path.insert(0, "D:/CrowdShield")
from ai_core.cv_pipeline.scripts.pipeline import CVPipeline
from ai_core.shared.zone_config import generate_grid_zones

def verify():
    zones = generate_grid_zones(2, 2)
    videos = [
        "empty_room.mp4",
        "baseline.mp4",
        "surge.mp4",
        "anomaly.mp4",
    ]
    sample_dir = Path("D:/CrowdShield/ai_core/cv_pipeline/sample_videos")

    all_results = {}

    for vid in videos:
        vpath = sample_dir / vid
        if not vpath.exists():
            print(f"[WARN] {vpath} not found!", flush=True)
            continue
        
        t0 = time.time()
        print(f"\n==========================================", flush=True)
        print(f"VERIFYING PIPELINE ON: {vid}", flush=True)
        print(f"==========================================", flush=True)
        pipeline = CVPipeline(str(vpath), zones)
        
        flags_per_zone = {z.zone_id: {} for z in zones}
        total_flags = {}
        frame_count = 0

        for r in pipeline._iter_frame_records(vpath, sample_every_n_frames=3):
            frame_count += 1
            for z in r["zones"]:
                zid = z["zone_id"]
                for f in z["anomaly_flags"]:
                    flags_per_zone[zid][f] = flags_per_zone[zid].get(f, 0) + 1
                    total_flags[f] = total_flags.get(f, 0) + 1

        dt = time.time() - t0
        all_results[vid] = {
            "sampled_frames": frame_count,
            "duration_sec": round(dt, 2),
            "total_flags": total_flags,
            "flags_per_zone": flags_per_zone,
        }

        print(f"Done in {dt:.2f}s across {frame_count} sampled frames.", flush=True)
        print(f"Total Flags for {vid}: {total_flags}", flush=True)
        for zid, fdict in flags_per_zone.items():
            print(f"  Zone {zid}: {fdict}", flush=True)

    print("\n" + "="*80, flush=True)
    print("FINAL SUMMARY REPORT FOR MANUAL VERIFICATION", flush=True)
    print("="*80, flush=True)
    for vid, res in all_results.items():
        print(f"\n* Video: {vid}", flush=True)
        print(f"  - Sampled Frames: {res['sampled_frames']}", flush=True)
        print(f"  - Execution Time: {res['duration_sec']}s", flush=True)
        print(f"  - Total Flags Detected: {res['total_flags']}", flush=True)
        print(f"  - Zone Breakdown: {res['flags_per_zone']}", flush=True)

if __name__ == "__main__":
    verify()
