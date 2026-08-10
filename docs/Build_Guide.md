# CrowdShield — Complete AI-First Build Guide
### From Empty Folder to Demo-Ready Prototype

---

## How to Use This Guide

This is a **phase-by-phase, vibe-coding build guide** for CrowdShield — an AI-powered early warning system for crowd stampede prevention. It is written to be followed sequentially by a small hackathon team (or a solo builder) using AI coding assistants (Claude Code, Cursor, or similar) to generate the majority of the implementation code.

**What "vibe coding" means in this guide:** for each phase, you are given a ready-to-paste prompt block designed for an AI coding agent. You paste the prompt, let the agent generate the code, then you run the **Test Cases** listed for that phase to verify the output actually works before moving to the next phase. Do **not** skip verification — in an AI-first build, unverified phases compound into unusable systems by Phase 5. Treat every "Phase Deliverable" as a hard gate: if the deliverable doesn't work, do not proceed.

**Structure of every phase in this guide:**
1. **Goal** — what this phase accomplishes and why it's sequenced here
2. **Prerequisites** — what must be true/working before you start
3. **Sub-steps** — detailed technical breakdown of what's being built
4. **Vibe Coding Prompt(s)** — copy-paste prompts for your AI coding agent
5. **Test Cases** — concrete, runnable checks that prove the phase works
6. **Phase Checklist** — tickable list to confirm completion
7. **Common Pitfalls** — known failure modes and how to fix them

**Why the AI/ML core comes first:** Every other layer of this system (backend, dashboard, mobile app) is just a consumer of structured JSON data produced by the AI/ML core (Phases 1–3). If you build the dashboard before the CV pipeline outputs real data, you'll be styling UI around fake mock data and will have to redo the data-binding work later. By building Phases 1→2→3 first, by the time you reach Phase 4 (backend) you're wiring up **real, working, already-tested** data producers — not guessing at a schema.

---

## Project Summary (for context — read this before starting)

**CrowdShield** is an affordable, AI-powered early warning system designed to prevent crowd stampedes at large public gatherings (festivals, sports venues, religious events, regional celebrations in India). It replaces reactive, manual CCTV monitoring with **predictive public safety**: computer vision estimates crowd density and movement in real time, a risk-prediction engine forecasts crowd crushes and panic propagation *before* they happen, a generative AI layer turns risk data into actionable recommendations and multilingual announcements, and both a command dashboard (for authorities) and a citizen mobile app (for attendees) surface this intelligence to the people who need it.

The system is built entirely from free/free-tier tools, intentionally selected for compatibility with AI coding assistants, so it can be built end-to-end in a hackathon timeframe.

---

## Full Phase Map

| Phase | Name | Layer | Depends On |
|---|---|---|---|
| 0 | Environment & Repo Setup | Infra | — |
| 1 | CV & Video Analytics Pipeline | AI/ML Core 1 | Phase 0 |
| 2 | Risk Prediction & Simulation Engine | AI/ML Core 2 | Phase 1 |
| 3 | Generative AI, Recommendations & Voice Pipeline | AI/ML Core 3 | Phase 2 |
| 4 | Backend Orchestration & Real-Time Data Pipeline | Backend | Phases 1–3 |
| 5 | Command Dashboard & 3D Digital Twin Frontend | Frontend (Web) | Phase 4 |
| 6 | Companion Mobile Application (Citizen App) | Frontend (Mobile) | Phase 4 |
| 7 | System Integration & Hackathon Pitch Demo Setup | Integration | Phases 1–6 |
| 8 | Model Fine-Tuning for Demo Videos (Appendix) | AI/ML Tuning | Phase 1 (revisit before Phase 7) |

Every feature listed in `Features.md` is mapped to a specific phase and sub-step in this guide — see the **Feature Coverage Matrix** at the very end of this document for a full audit trail confirming nothing was dropped.

---

## Phase 0: Environment & Repository Setup

### Goal
Set up a monorepo structure, Python environment, Node environment, and all free-tier cloud accounts *before* writing any AI/ML code, so that later phases are never blocked on account signup or dependency install mid-flow.

### Sub-steps

**0.1 — Create accounts (all free tier):**
- [ ] [Supabase](https://supabase.com) account + new project (note your Project URL and `anon` / `service_role` keys)
- [ ] [Google AI Studio](https://aistudio.google.com) account → generate a **Gemini API key**
- [ ] (Optional) [Anthropic Console](https://console.anthropic.com) account → generate a **Claude API key** for supplementary reasoning calls
- [ ] [OpenWeatherMap](https://openweathermap.org/api) account → generate a free API key
- [ ] [Firebase](https://console.firebase.google.com) account → new project (for FCM + Geolocation later, Phase 6)
- [ ] [Render](https://render.com) or [Railway](https://railway.app) account (backend hosting, Phase 4)
- [ ] [Vercel](https://vercel.com) account (dashboard hosting, Phase 5)
- [ ] [Google Colab](https://colab.research.google.com) access (free T4 GPU runtime for CV pipeline testing, Phase 1)

**0.2 — Repository structure:**

Create a monorepo with this exact structure — every later phase writes into a predetermined folder, which avoids the AI coding agent guessing paths inconsistently across phases:

```
crowdshield/
├── ai_core/
│   ├── cv_pipeline/            # Phase 1
│   │   ├── models/             # downloaded YOLO weights
│   │   ├── scripts/
│   │   └── sample_videos/
│   ├── risk_engine/             # Phase 2
│   │   └── scripts/
│   ├── genai_pipeline/          # Phase 3
│   │   └── scripts/
│   └── shared/                  # shared JSON schemas / types
├── backend/                     # Phase 4 (FastAPI)
│   ├── app/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── models/
│   │   └── websockets/
│   └── tests/
├── dashboard/                    # Phase 5 (React + Vite)
│   └── src/
├── mobile/                       # Phase 6 (React Native / Expo)
│   └── src/
├── demo/                         # Phase 7 (demo assets, mock data)
│   ├── videos/
│   └── mock_data/
└── docs/
    └── Build_Guide.md            # this file
```

**0.3 — Local tooling install:**
- [ ] Python 3.10+ with `venv` (CV/risk/genai pipelines)
- [ ] Node.js 18+ with `npm` or `pnpm` (backend orchestration tooling, dashboard, mobile)
- [ ] Git + GitHub repo created and connected
- [ ] VS Code (or Cursor) with Python + ESLint/Prettier extensions
- [ ] Docker (optional, for consistent deployment later — not required for hackathon demo)

### Vibe Coding Prompt — Phase 0

```
Set up a monorepo for a hackathon project called "CrowdShield". Create this exact
folder structure with placeholder README.md files in each major folder explaining
its purpose:

crowdshield/
├── ai_core/
│   ├── cv_pipeline/{models,scripts,sample_videos}
│   ├── risk_engine/scripts
│   ├── genai_pipeline/scripts
│   └── shared
├── backend/app/{routers,services,models,websockets}
├── backend/tests
├── dashboard/src
├── mobile/src
├── demo/{videos,mock_data}
└── docs

Also create:
1. A root .gitignore covering Python (venv, __pycache__, .env), Node (node_modules,
   .env.local, dist, build), and OS files (.DS_Store).
2. A root .env.example listing every environment variable this project will need:
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY,
   ANTHROPIC_API_KEY, OPENWEATHERMAP_API_KEY, FIREBASE_CONFIG_JSON,
   BACKEND_WS_URL, BACKEND_HTTP_URL.
3. A root README.md that briefly describes the CrowdShield project (AI-powered
   crowd stampede early-warning system) and links to docs/Build_Guide.md for
   full build instructions.
4. A Python virtual environment setup script (setup_python_env.sh) that creates
   a venv in ai_core/ and installs: ultralytics, opencv-python, numpy, pandas,
   fastapi, uvicorn, python-socketio, supabase, google-generativeai, anthropic,
   faster-whisper, edge-tts, gTTS, requests, python-dotenv, websockets, pytest.

Do not write any AI/ML logic yet — this step is scaffolding only.
```

### Test Cases — Phase 0

| # | Test | Expected Result |
|---|---|---|
| 0.1 | Run `tree crowdshield/ -L 3` (or `find` if `tree` unavailable) | Matches the folder structure above exactly |
| 0.2 | Run `bash setup_python_env.sh` | Completes with no pip errors; `.venv` exists |
| 0.3 | Run `python -c "import ultralytics, cv2, fastapi"` inside the venv | No `ModuleNotFoundError` |
| 0.4 | Check `.env.example` | Contains all 9 listed variables, no real secrets committed |
| 0.5 | Run `git status` after first commit | `.env`, `node_modules/`, `venv/` are NOT tracked |
| 0.6 | Open Supabase project dashboard | Project is live, empty (no tables yet — that's Phase 4) |
| 0.7 | Test Gemini API key with a curl/python "hello world" call | Returns a valid completion, not a 401/403 |

## Phase 0 Checklist

- [ ] All 8 free-tier accounts created and API keys retrieved
- [ ] Monorepo folder structure created exactly as specified
- [ ] `.gitignore` and `.env.example` committed
- [ ] Python venv installs cleanly with all required packages
- [ ] Git repo initialized, first commit pushed to GitHub
- [ ] Every API key tested with a minimal "hello world" call and confirmed working
- [ ] Team members (if any) have repo access and can clone + run `setup_python_env.sh` locally

### Common Pitfalls

- **Committing `.env` by accident**: always create `.env.example` first, add `.env` to `.gitignore` before creating the real `.env`.
- **Supabase free tier pausing**: Supabase free projects pause after 7 days of inactivity — if you take a break mid-build, you may need to "unpause" the project from the dashboard before Phase 4 backend calls will succeed.
- **Gemini API regional restrictions**: if `generativelanguage.googleapis.com` calls fail with a location error, verify Google AI Studio's supported-country list for free-tier API keys before assuming your code is broken.
---

# Phase 1: CV & Video Analytics Pipeline (AI/ML Core 1)

## Goal
Convert raw video/image feeds into a structured JSON data stream containing, per zone and per frame: crowd count, density metric, velocity vectors, flow direction, and anomaly flags. This JSON schema becomes the **single contract** that every downstream phase (risk engine, backend, dashboard, mobile) consumes — so getting this schema right now saves enormous rework later.

This corresponds to **Features.md → Section 1: Crowd Monitoring** in full (Density Estimation, Movement Tracking, Congestion & Bottleneck Identification, Anomaly Detection).

## Prerequisites
- Phase 0 complete: Python venv working, `ultralytics` + `opencv-python` installed
- At least 2–3 sample crowd videos placed in `ai_core/cv_pipeline/sample_videos/` (can be stock stampede/crowd footage for now — your hand-picked demo videos come in Phase 8)
- Google Colab access for GPU-accelerated testing (optional but recommended, since YOLO inference on long videos is slow on CPU)

---

## Sub-steps

### Step 1.1: Object Detection & Density Estimation

**What this does:** loads a pretrained YOLO model, runs it frame-by-frame (or on a sampled interval, e.g. every 3rd frame for performance) on a video, draws/counts bounding boxes for the "person" class, and divides the video frame into a grid of **zones** (e.g. a 3×3 or configurable N×M grid) so density can be computed per-zone rather than for the whole frame.

**Key design decisions to lock in now:**
- **Zone definition:** zones are defined as normalized rectangular regions of the frame (`x_min, y_min, x_max, y_max` as fractions 0–1 of frame width/height), NOT pixel coordinates — this makes zones resolution-independent, so the same zone config works regardless of video resolution, and maps cleanly onto the venue map in Phase 5.
- **Density metric:** `density = person_count_in_zone / zone_area_m²` is the "correct" physics definition, but since we don't have real-world calibration for arbitrary demo footage, use a **relative density metric**: `density = person_count_in_zone / zone_pixel_area * reference_constant`, normalized to a 0.0–1.0 scale using a configurable `max_expected_count_per_zone`. Document this clearly as an approximation — for the hackathon pitch, relative/comparative density (this zone is 3x denser than that one) matters more than absolute physical accuracy.
- **Model choice:** YOLOv8n or YOLOv11n (the "n" = nano variant) — smallest/fastest, sufficient for person-class detection, runs in real time even on modest hardware.

### Step 1.2: Movement Speed & Direction (Optical Flow)

**What this does:** uses OpenCV's Farneback dense optical flow algorithm between consecutive frames to compute a motion vector field, then aggregates that field per zone into an average speed (pixels/frame, later converted to a normalized "flow intensity") and a dominant direction (as an angle in degrees, or a compass-style N/S/E/W/NE/etc. label for human-readability in the dashboard).

**Why Farneback specifically:** it's dense (every pixel gets a vector, not just tracked features), built into OpenCV with no extra dependencies, and fast enough for near-real-time use on downsampled frames — ideal for a hackathon timeframe versus more accurate but heavier learned optical-flow models (e.g. RAFT).

### Step 1.3: Tracking & Anomaly Detection

**What this does:** wraps YOLO detections with ByteTrack (built into Ultralytics via `model.track()`) to assign persistent IDs to individuals across frames, enabling trajectory analysis. From trajectories, derive:
- **Reverse flow detection:** compare an individual's movement vector against the zone's dominant flow direction; if a meaningful fraction of tracked individuals are moving opposite to the dominant flow, flag `reverse_flow_detected: true`.
- **Sudden stop / bottleneck detection:** track per-zone average speed over a sliding window (e.g. last 10 frames); if average speed drops sharply (e.g. >60% drop) while density stays high or rises, flag `bottleneck_detected: true`.
- **Erratic movement:** compute per-individual trajectory curvature/direction-variance; flag individuals whose direction changes exceed a threshold across consecutive frames as `erratic_movement_flag`.

### Phase 1 Deliverable — Output JSON Schema

Lock this schema in now. Every later phase depends on it exactly as written:

```json
{
  "timestamp": "2026-08-03T14:32:10Z",
  "frame_number": 452,
  "source_id": "cam_01",
  "zones": [
    {
      "zone_id": "zone_A1",
      "bounds_normalized": {"x_min": 0.0, "y_min": 0.0, "x_max": 0.33, "y_max": 0.5},
      "crowd_count": 47,
      "density_score": 0.71,
      "avg_flow_speed": 0.42,
      "avg_flow_direction_deg": 187.5,
      "avg_flow_direction_label": "S",
      "reverse_flow_detected": false,
      "bottleneck_detected": true,
      "anomaly_flags": ["sudden_stop"],
      "tracked_ids_in_zone": [12, 15, 19, 22]
    }
  ],
  "frame_totals": {
    "total_crowd_count": 214,
    "max_zone_density": 0.71,
    "highest_risk_zone_id": "zone_A1"
  }
}
```

---

## Vibe Coding Prompt — Phase 1

```
I'm building the CV pipeline for a hackathon project called CrowdShield (an
AI-powered crowd stampede early-warning system). Work inside ai_core/cv_pipeline/.

Build a Python module with the following components:

1. `models/download_weights.py` — downloads YOLOv8n (yolov8n.pt) via the
   ultralytics package on first run, saves it to ai_core/cv_pipeline/models/.

2. `scripts/zone_config.py` — defines a configurable zone grid system.
   - A `Zone` dataclass: zone_id (str), bounds_normalized (dict with x_min,
     y_min, x_max, y_max as floats 0-1), max_expected_count (int, default 50,
     used to normalize density to 0-1 scale).
   - A function `generate_grid_zones(rows: int, cols: int) -> list[Zone]` that
     auto-generates an evenly spaced N x M grid of zones covering the full
     frame, labeled zone_A1, zone_A2... zone_B1, etc (row letter + column
     number).
   - Support loading zone configs from a JSON file so zones can later be
     customized per-venue.

3. `scripts/detector.py` — a `CrowdDetector` class that:
   - Loads the YOLOv8n model via ultralytics.
   - Has a method `detect_frame(frame: np.ndarray) -> list[dict]` returning a
     list of detections, each with bbox (x1,y1,x2,y2 in pixels), confidence,
     and center point — filtered to COCO class 0 (person) only.
   - Has a method `assign_to_zones(detections, zones, frame_width, frame_height)`
     that maps each detection's center point into the zone(s) whose
     normalized bounds contain it, and returns a dict of zone_id -> list of
     detections in that zone.
   - Has a method `compute_density(detections_in_zone, zone) -> float`
     returning min(count / zone.max_expected_count, 1.0).

4. `scripts/optical_flow.py` — an `OpticalFlowAnalyzer` class that:
   - Takes two consecutive grayscale frames.
   - Computes dense optical flow using cv2.calcOpticalFlowFarneback with
     reasonable default parameters (pyr_scale=0.5, levels=3, winsize=15,
     iterations=3, poly_n=5, poly_sigma=1.2, flags=0).
   - Has a method `compute_zone_flow(flow_field, zone, frame_width,
     frame_height) -> dict` returning avg_flow_speed (normalized 0-1 by
     dividing by a max_expected_speed constant, clamped), avg_flow_direction_deg
     (0-360, computed from mean vector angle), and avg_flow_direction_label
     (compass direction: N/NE/E/SE/S/SW/W/NW, mapped from the degree value).

5. `scripts/tracker.py` — a `CrowdTracker` class wrapping Ultralytics'
   built-in ByteTrack (model.track(persist=True, tracker="bytetrack.yaml")):
   - Method `track_frame(frame) -> list[dict]` returning detections each with
     a persistent track_id.
   - Maintains a rolling history (deque, maxlen=30 frames) of each track_id's
     center-point positions.
   - Method `detect_anomalies(zone_id, tracks_in_zone, zone_flow_direction_deg,
     history) -> dict` that computes:
     a) reverse_flow_detected: True if >40% of tracked individuals in this
        zone have a movement vector (from their last 2 positions) more than
        135 degrees different from zone_flow_direction_deg.
     b) erratic_movement_flag: True if any tracked individual's direction
        changed by more than 90 degrees across 3+ consecutive frame-to-frame
        comparisons within the last 10 frames.
     c) bottleneck_detected: True if this zone's avg_flow_speed (pass in
        current and a 10-frame rolling average) dropped by more than 60%
        while crowd_count in the zone stayed the same or increased.
        Return as a dict with these three boolean keys plus an
        "anomaly_flags" list of string labels for whichever are True
        (e.g. ["reverse_flow", "bottleneck"]).

6. `scripts/pipeline.py` — the main orchestrator, a `CVPipeline` class that:
   - Takes a video file path and a Zone list on init.
   - Has a `process_video(video_path, sample_every_n_frames=3, output_path=None)`
     method that:
     a) Opens the video with cv2.VideoCapture.
     b) Iterates frames, running detection + tracking + optical flow (optical
        flow needs the previous frame, so skip flow computation on frame 0).
     c) For each sampled frame, assembles the exact JSON schema below
        (this schema is FINAL — do not deviate from field names):

     {
       "timestamp": <ISO 8601 UTC string, use frame_number / assumed_fps to
         offset from a start time if no real timestamp available>,
       "frame_number": <int>,
       "source_id": <string, passed as a pipeline parameter, default "cam_01">,
       "zones": [
         {
           "zone_id": <string>,
           "bounds_normalized": {"x_min": <float>, "y_min": <float>,
             "x_max": <float>, "y_max": <float>},
           "crowd_count": <int>,
           "density_score": <float 0-1>,
           "avg_flow_speed": <float 0-1>,
           "avg_flow_direction_deg": <float 0-360>,
           "avg_flow_direction_label": <string>,
           "reverse_flow_detected": <bool>,
           "bottleneck_detected": <bool>,
           "anomaly_flags": [<string>, ...],
           "tracked_ids_in_zone": [<int>, ...]
         }
       ],
       "frame_totals": {
         "total_crowd_count": <int, sum across zones>,
         "max_zone_density": <float, max density_score across zones>,
         "highest_risk_zone_id": <string, zone_id with max density_score>
       }
     }

     d) Appends each frame's JSON object to a list, and at the end writes the
        full list to output_path as a JSON array (pretty-printed, indent=2).
     e) Also has an option to yield each frame's JSON one at a time as a
        generator (for later real-time streaming use in Phase 4) instead of
        batch-writing — support BOTH modes via a `mode="batch"|"stream"`
        parameter.
   - Include a `if __name__ == "__main__"` CLI entry point:
     `python pipeline.py --video sample_videos/test1.mp4 --zones 3x3 --output
     output_test1.json` using argparse.

7. Add clear inline comments explaining the density normalization approach
   and flag it as an approximation suitable for relative (not
   physically-calibrated) crowd density comparison, since we lack real-world
   camera calibration data for arbitrary demo footage.

8. Add a requirements check at the top of pipeline.py that gracefully errors
   with a helpful message if ultralytics/opencv/numpy aren't installed.

Do NOT build the risk scoring or panic simulation yet — that's a separate
module (Phase 2). This phase only outputs the structured JSON described
above from raw video.
```

### Vibe Coding Prompt — Phase 1 (Colab Testing Companion)

```
Create a Google Colab notebook (as a .ipynb file at
ai_core/cv_pipeline/colab_test_pipeline.ipynb) that:
1. Installs ultralytics and opencv-python-headless via pip.
2. Mounts Google Drive (for uploading test videos) or accepts a direct file
   upload via google.colab.files.upload().
3. Clones or copies in the cv_pipeline module code (detector.py,
   optical_flow.py, tracker.py, zone_config.py, pipeline.py).
4. Runs CVPipeline.process_video() on an uploaded test video with a 3x3 zone
   grid, prints a progress bar (tqdm) over frames processed.
5. At the end, prints summary stats: total frames processed, avg processing
   FPS, average crowd count across all zones, and any frames where
   anomaly_flags was non-empty (to spot-check anomaly detection is firing).
6. Includes a cell that overlays bounding boxes + zone grid lines + zone
   density labels onto a sample frame using cv2/matplotlib, so we can
   visually sanity-check detection and zone assignment before trusting the
   JSON output.
```

---

## Test Cases — Phase 1

| # | Test | Expected Result |
|---|---|---|
| 1.1 | Run `python pipeline.py --video sample_videos/empty_room.mp4` on a video with zero people | `total_crowd_count: 0` for all frames, no crash |
| 1.2 | Run pipeline on a video with a known small number of people (e.g. 3 people walking, manually counted) | `total_crowd_count` is within ±1 of the manual count for most sampled frames |
| 1.3 | Run pipeline on a dense crowd video | `density_score` for the most populated zone is noticeably higher (>0.5) than sparse zones |
| 1.4 | Feed two frames where the crowd is stationary (e.g. a paused/near-static clip) | `avg_flow_speed` is close to 0 for all zones |
| 1.5 | Feed a video panning in one clear direction (e.g. a crowd walking left-to-right) | `avg_flow_direction_label` is consistent (e.g. "E") across most zones and frames |
| 1.6 | Construct or find a clip where a subset of people visibly reverse direction against the main flow | `reverse_flow_detected: true` fires on the relevant zone during that segment |
| 1.7 | Construct or find a clip with a visible bottleneck (crowd piling up, speed dropping) | `bottleneck_detected: true` fires when density is high and speed is dropping |
| 1.8 | Run the full pipeline on a 30–60 second clip end-to-end | Completes without exceptions; output JSON is valid (`json.load()` succeeds); every frame object has all required fields |
| 1.9 | Run pipeline twice on the same video | Output is deterministic/consistent (same crowd counts ± minor tracker ID differences) |
| 1.10 | Check output JSON zone bounds | All `bounds_normalized` values are within [0.0, 1.0] and zones tile the frame with no gaps (for a grid config) |
| 1.11 | Time the pipeline on Colab T4 GPU vs local CPU | Confirms whether real-time (≥15 FPS effective processing) is achievable; document actual throughput for Phase 7 demo planning |

## Phase 1 Checklist

- [ ] YOLOv8n weights download and load successfully
- [ ] Zone grid generation produces correct normalized bounds for arbitrary N×M
- [ ] Person detection working and filtered to COCO class 0 only
- [ ] Detections correctly assigned to zones based on center-point containment
- [ ] Density score computed and normalized to 0.0–1.0
- [ ] Optical flow computed between consecutive frames without crashing on frame 0 edge case
- [ ] Flow speed/direction aggregated correctly per zone
- [ ] ByteTrack producing persistent track IDs across frames
- [ ] Reverse flow, bottleneck, and erratic movement anomaly detection all implemented and independently testable
- [ ] Final JSON schema matches the locked spec exactly (field names, types, nesting)
- [ ] CLI entry point works: `python pipeline.py --video X --zones 3x3 --output Y.json`
- [ ] Streaming generator mode implemented (for Phase 4 reuse)
- [ ] Colab notebook runs end-to-end on a T4 GPU and visually confirms detection + zone overlay correctness
- [ ] Pipeline tested on at least 3 different sample videos with visibly different crowd conditions (sparse, dense, flowing, bottlenecked)
- [ ] Processing throughput (FPS) documented for demo planning

## Common Pitfalls

- **Optical flow requires grayscale + same-size frames** — if your video has variable resolution or you resize frames inconsistently between the detection and flow steps, Farneback will throw a shape-mismatch error. Standardize frame resizing once, early in the per-frame loop.
- **ByteTrack ID churn**: if people overlap/occlude each other, ByteTrack may assign a new ID after occlusion instead of preserving the old one — this is a known limitation, not a bug in your code. Don't over-index on ID persistence accuracy for the anomaly logic; use zone-level aggregates, which are more robust than individual trajectory accuracy.
- **Density normalization is an approximation** — be ready to explain this clearly in the pitch: this is *relative* density (this zone vs. that zone, this moment vs. last moment), not physically-calibrated persons-per-square-meter, because that requires camera calibration data you won't have for arbitrary hackathon demo footage.
- **CPU inference is slow** — YOLOv8n on CPU can be 3–8 FPS depending on hardware; this is fine for offline processing of pre-recorded demo clips (Phase 7 uses pre-recorded clips specifically for this reason) but budget accordingly and always test actual throughput on your demo machine before the pitch.
- **`sample_every_n_frames`**: processing every frame is often unnecessary and slow; sampling every 3rd frame (with optical flow computed between the sampled frames, not consecutive raw frames) is usually visually indistinguishable in a demo and 3x faster.
---

# Phase 2: Risk Prediction & Simulation Engine (AI/ML Core 2)

## Goal
Consume the Phase 1 JSON stream (density, flow, anomaly flags per zone) and produce: a unified per-zone risk score (0.0–1.0), a panic-propagation simulation showing how risk could spread to adjacent zones over time, a "fast-forward" predictive mode projecting 5–10 minutes ahead, and an offline pre-event stress-testing mode plus resource allocation suggestions.

This corresponds to **Features.md → Section 2: Risk Prediction** in full, plus the **Pre-Event Planning Module** nice-to-have (Scenario Stress-Testing + Resource Allocation Optimization).

## Prerequisites
- Phase 1 complete and producing valid JSON output (batch or streaming)
- NumPy/Pandas installed
- A sequence of at least 10–20 consecutive Phase 1 JSON frame objects available (either from a real pipeline run, or hand-crafted synthetic test frames) to test trend-based logic like "rate of density increase"

---

## Sub-steps

### Step 2.1: Multi-Factor Risk Scoring Algorithm

**What this does:** combines multiple Phase 1 signals into one risk score per zone, per frame:

```
risk_score = clamp(
    w1 * density_score +
    w2 * density_rate_of_change +
    w3 * flow_convergence_score +
    w4 * bottleneck_indicator +
    w5 * anomaly_indicator,
  0.0, 1.0
)
```

Where:
- `density_score` — directly from Phase 1
- `density_rate_of_change` — `(current_density - density_N_frames_ago) / N`, normalized and clamped to [0,1] (only positive increases count toward risk; a decreasing density should not raise risk)
- `flow_convergence_score` — a NEW metric computed in Phase 2: how much the flow directions of *adjacent* zones point INTO this zone (vectors converging = people being funneled into a space = danger) vs. diverging away (safe). Computed by comparing this zone's neighbors' `avg_flow_direction_deg` against the direction that would point toward this zone's centroid.
- `bottleneck_indicator` — `1.0` if `bottleneck_detected` was `true` in Phase 1 output, else `0.0`
- `anomaly_indicator` — proportion of anomaly flags present (e.g. `len(anomaly_flags) / 3`, since there are 3 possible anomaly types)

Default weights (tunable): `w1=0.35, w2=0.25, w3=0.20, w4=0.15, w5=0.05` — document these as configurable constants, not magic numbers, so they can be tuned during Phase 8 fine-tuning against real demo footage.

### Step 2.1b: Route Blockage Prediction

**What this does:** Features.md's "Flow Disruption" requirement names two distinct things — detecting reverse crowd movement (Phase 1's `reverse_flow_detected`) AND *predicting potential route blockages*. These are related but not the same: reverse flow is a per-zone anomaly signal, while a "route" is a connected path of zones (e.g. the sequence a citizen's safe-route navigation, Phase 6, would walk through to reach an exit). A zone can be individually calm while still sitting on a route that's about to become impassable because a zone further along it is escalating.

This step adds a `RouteBlockagePredictor` that consumes the SAME zone adjacency map used by the panic diffusion model, plus a list of known routes (a route = an ordered list of zone_ids from some origin toward an exit zone, either hardcoded for the demo venue or derived by finding the shortest zone-adjacency path to the nearest zone flagged `is_exit: true`), and flags a route as `at_risk_of_blockage` if ANY zone along it currently has `risk_level` "high"/"critical" OR is predicted to cross "high" within the panic-diffusion simulation's near-term steps (reusing Step 2.2/2.3's simulation output, not a separate model). This is the mechanism that later powers Phase 6's risk-aware safe-route navigation — that mobile feature needs to know not just "is this exact zone dangerous" but "is any zone on my planned path about to become dangerous."

Output per route: `{"route_id":..., "zone_sequence": [...], "at_risk_of_blockage": bool, "blocking_zone_id": <the zone_id causing the flag, or null>, "reason": <"currently_high_risk" | "predicted_high_risk_within_simulation">}`.

### Step 2.2: Cellular Automaton / Panic Diffusion Model

**What this does:** models zones as cells in a grid; each zone has a `risk_score`. At each simulation timestep, a zone's risk score can influence its immediate neighbors (adjacent zones in the grid) proportional to: (a) the source zone's risk score, (b) a configurable `diffusion_rate` constant, (c) whether the neighbor zone already has people in it (diffusion into an empty zone is meaningless for panic spread, since panic spreads via *people*, not simply space).

```
neighbor_risk_delta = source_zone.risk_score * diffusion_rate * (neighbor_zone.crowd_count > 0)
neighbor_zone.simulated_risk_score = clamp(
    neighbor_zone.risk_score + neighbor_risk_delta, 0.0, 1.0
)
```

This runs iteratively for however many simulated timesteps are requested, decaying slightly each step (`decay_rate`) to represent risk naturally dissipating if not reinforced by new real data.

### Step 2.3: Scenario Simulation & Pre-Event Planning

**What this does:** three related but distinct simulation modes built on the same diffusion engine:

1. **Fast-Forward Mode (live prediction):** given the current real-time zone state, run the diffusion model forward N iterations (each iteration = an assumed time delta, e.g. 30 seconds) to project risk 5–10 minutes into the future, producing a "predicted crush timeline" — a series of snapshots showing which zones are predicted to cross a danger threshold and when.

2. **Offline Pre-Event Stress-Test Mode:** takes a *venue layout* (zone grid + adjacency + entry/exit points) and a *hypothetical attendance number* (not live camera data) as input, seeds initial zones near entrances with simulated crowd buildup based on a simple arrival-rate model, and runs the diffusion simulation to flag zones likely to become bottlenecks *before the event happens* — for organizers planning days in advance.

3. **Resource Allocation Optimization:** given historical event data (past attendance, incident logs — can be a small mock/sample dataset for the hackathon), plus the stress-test output, generate suggestions for where to position barricades, medical tents, and security personnel — implemented as a heuristic (not deep ML, given hackathon time constraints): rank zones by predicted peak risk score, and suggest resource placement at/near the top-N highest-risk zones and at chokepoints (zones with high `flow_convergence_score` from multiple neighbors).

### Phase 2 Deliverable — Output JSON Schema

```json
{
  "timestamp": "2026-08-03T14:32:10Z",
  "zones": [
    {
      "zone_id": "zone_A1",
      "risk_score": 0.82,
      "risk_level": "critical",
      "contributing_factors": {
        "density_score": 0.71,
        "density_rate_of_change": 0.15,
        "flow_convergence_score": 0.60,
        "bottleneck_indicator": 1.0,
        "anomaly_indicator": 0.33
      }
    }
  ],
  "panic_propagation": {
    "simulated_steps": [
      {
        "step": 1,
        "time_offset_seconds": 30,
        "zone_risk_scores": {"zone_A1": 0.82, "zone_A2": 0.35, "zone_B1": 0.20}
      }
    ]
  },
  "predicted_crush_timeline": [
    {
      "zone_id": "zone_A1",
      "predicted_critical_at_seconds": 90,
      "confidence": "medium"
    }
  ],
  "resource_allocation_suggestions": [
    {
      "zone_id": "zone_A1",
      "suggestion_type": "security_personnel",
      "reason": "Highest predicted risk score and high flow convergence from 3 adjacent zones",
      "priority": "high"
    }
  ],
  "route_blockage_predictions": [
    {
      "route_id": "route_north_entrance_to_exit_B",
      "zone_sequence": ["zone_A1", "zone_A2", "zone_B1"],
      "at_risk_of_blockage": true,
      "blocking_zone_id": "zone_A1",
      "reason": "currently_high_risk"
    }
  ]
}
```

---

## Vibe Coding Prompt — Phase 2

```
I'm building the risk prediction engine for CrowdShield, a hackathon project
for AI-powered crowd stampede prevention. This engine consumes JSON output
from an existing CV pipeline (Phase 1) with this exact input schema per frame:

{
  "timestamp": "...", "frame_number": 0, "source_id": "cam_01",
  "zones": [
    {"zone_id": "zone_A1",
     "bounds_normalized": {"x_min":0,"y_min":0,"x_max":0.33,"y_max":0.5},
     "crowd_count": 47, "density_score": 0.71, "avg_flow_speed": 0.42,
     "avg_flow_direction_deg": 187.5, "avg_flow_direction_label": "S",
     "reverse_flow_detected": false, "bottleneck_detected": true,
     "anomaly_flags": ["sudden_stop"], "tracked_ids_in_zone": [12,15,19]}
  ],
  "frame_totals": {"total_crowd_count": 214, "max_zone_density": 0.71,
    "highest_risk_zone_id": "zone_A1"}
}

Work inside ai_core/risk_engine/. Build:

1. `scripts/zone_adjacency.py` — given a list of zones with bounds_normalized
   (assume a grid layout, e.g. zone_A1, zone_A2 = row A columns 1,2; zone_B1
   = row B column 1), compute a zone adjacency map (which zones are directly
   N/S/E/W-adjacent to which others) purely from the bounds_normalized
   coordinates (zones sharing an edge = adjacent), not from the naming
   convention, so it also works for irregular custom zone layouts loaded from
   a JSON config.

2. `scripts/risk_scorer.py` — a `RiskScorer` class that:
   - Maintains a rolling history (deque, maxlen=20) of past Phase-1-schema
     frames per zone, keyed by zone_id, to compute rate-of-change metrics.
   - Method `compute_density_rate_of_change(zone_id, current_density) ->
     float` returning the normalized positive-only rate of density increase
     over the last N frames (clamp negative changes to 0).
   - Method `compute_flow_convergence(zone_id, all_zones_this_frame,
     adjacency_map) -> float` — for each neighbor of zone_id, compute whether
     the neighbor's avg_flow_direction_deg points roughly toward zone_id's
     centroid (within a 45-degree tolerance); convergence score = fraction of
     neighbors whose flow points inward, weighted by those neighbors'
     avg_flow_speed.
   - Method `compute_risk_score(zone_frame_data, all_zones_this_frame,
     adjacency_map) -> dict` combining, with CONFIGURABLE class-level default
     weights (w_density=0.35, w_rate=0.25, w_convergence=0.20,
     w_bottleneck=0.15, w_anomaly=0.05):
       risk_score = clamp(
         w_density * density_score +
         w_rate * density_rate_of_change +
         w_convergence * flow_convergence_score +
         w_bottleneck * (1.0 if bottleneck_detected else 0.0) +
         w_anomaly * (len(anomaly_flags) / 3.0),
       0, 1)
     Also bucket into risk_level: "low" (<0.3), "moderate" (0.3-0.55),
     "high" (0.55-0.75), "critical" (>=0.75).
     Return a dict with risk_score, risk_level, and a contributing_factors
     sub-dict showing each component (for dashboard transparency / explainability).
   - Method `score_frame(frame_json) -> dict` that runs the above for every
     zone in a Phase-1-schema frame and returns output matching this exact
     schema:
     {
       "timestamp": ..., "zones": [
         {"zone_id":..., "risk_score":..., "risk_level":...,
          "contributing_factors": {...}}
       ]
     }

3. `scripts/panic_diffusion.py` — a `PanicDiffusionModel` class that:
   - Takes the current scored zones (output of RiskScorer.score_frame) plus
     the adjacency map and current crowd_count per zone (from Phase 1 data).
   - Method `simulate_steps(current_zone_risk_scores: dict, zone_crowd_counts:
     dict, adjacency_map, num_steps=10, seconds_per_step=30,
     diffusion_rate=0.15, decay_rate=0.05) -> list[dict]` that iteratively:
     a) For each zone, computes risk_delta contributed by each neighbor:
        neighbor.risk_score * diffusion_rate * (1.0 if
        zone_crowd_counts[this_zone] > 0 else 0.0)
     b) Sums deltas from all neighbors, adds to this zone's risk score,
        applies decay_rate as a small subtraction, clamps to [0,1].
     c) Records a snapshot after each step:
        {"step": i, "time_offset_seconds": i*seconds_per_step,
         "zone_risk_scores": {zone_id: score, ...}}
     d) Returns the full list of step snapshots.
   - Method `predict_crush_timeline(simulated_steps, critical_threshold=0.75)
     -> list[dict]` that scans the simulated steps and, for each zone that
     crosses critical_threshold at some step, returns
     {"zone_id":..., "predicted_critical_at_seconds":...,
      "confidence": "high" if it was already close (>0.6) at step 0 else
      "medium" if it crossed by the midpoint else "low"}.

4. `scripts/pre_event_simulator.py` — a `PreEventSimulator` class for OFFLINE
   planning (no live camera, hypothetical inputs):
   - Method `simulate_arrival_buildup(zones, entry_zone_ids: list[str],
     expected_attendance: int, adjacency_map, arrival_duration_minutes=30,
     num_steps=20) -> list[dict]` that:
     a) Models a simple linear arrival rate (expected_attendance /
        arrival_duration_minutes people arriving per minute), seeded entirely
        into the specified entry_zone_ids initially.
     b) At each step, adds newly-arrived people to entry zones' crowd_count,
        recomputes density_score for those zones using each zone's
        max_expected_count, then runs one step of the PanicDiffusionModel
        diffusion logic (treating density_score as a proxy risk input for
        zones with no live camera anomaly data) to let congestion "spread" to
        adjacent zones as entry zones fill up.
     c) Returns step-by-step snapshots in the same shape as
        simulate_steps() above, so the SAME dashboard visualization
        (Phase 5) can render both live fast-forward AND offline pre-event
        simulations without needing separate UI code.
   - Method `flag_bottleneck_risks(steps, threshold=0.7) -> list[dict]`
     identifying zones that cross the threshold during the simulated
     build-up, useful for organizers to redesign the venue layout before the
     event.

5. `scripts/resource_allocator.py` — a `ResourceAllocator` class:
   - Method `suggest_allocations(scored_zones: list[dict], adjacency_map,
     historical_incident_zones: list[str] = None, top_n=3) -> list[dict]`
     that:
     a) Ranks zones by risk_score descending.
     b) For the top_n zones, and any zone in historical_incident_zones
        (weighted slightly higher — add +0.1 to their effective rank score
        if it appears in history), generates a suggestion dict:
        {"zone_id":..., "suggestion_type": one of
         "security_personnel"|"medical_tent"|"barricade_reconfiguration",
         "reason": <human-readable string explaining WHY, referencing the
          specific contributing factor that's highest for that zone>,
         "priority": "high"|"medium"}
     b) Assign suggestion_type based on which contributing factor dominates:
        high flow_convergence -> "barricade_reconfiguration" (redirect flow),
        high bottleneck_indicator -> "security_personnel" (manual crowd
        control needed), zone in historical_incident_zones -> "medical_tent"
        (precautionary, given history).
   - Include a small mock historical dataset generator function
     `generate_mock_historical_data() -> dict` producing 2-3 fake past
     events with attendance numbers and incident zone_ids, purely for demo
     purposes, clearly commented as MOCK DATA FOR HACKATHON DEMO.

6. `scripts/route_blockage_predictor.py` — a `RouteBlockagePredictor`
   class implementing the "predicting potential route blockages" half of
   the Flow Disruption feature (distinct from reverse-flow detection,
   which is a Phase 1 per-zone anomaly, not a route-level prediction):
   - Method `find_routes_to_exits(zones: list[dict], adjacency_map) ->
     list[dict]` that, given zones where some have `is_exit: true` in
     their config, computes for every non-exit zone the shortest
     adjacency path (simple BFS over the adjacency_map) to its nearest
     exit zone, returning a list of
     {"route_id": f"route_{origin_zone_id}_to_{exit_zone_id}",
      "zone_sequence": [...]} — one route per origin zone. Also accept
     an optional `custom_routes: list[dict]` parameter so a venue setup
     step can supply hand-defined named routes (e.g. "north entrance to
     exit B") instead of relying purely on auto-computed shortest paths.
   - Method `predict_blockages(routes: list[dict], current_scored_zones:
     dict[str, dict], simulated_steps: list[dict] = None,
     near_term_step_count=3) -> list[dict]` that, for each route:
     a) Checks if ANY zone_id in its zone_sequence currently has
        risk_level "high" or "critical" in current_scored_zones -> if
        so, {"at_risk_of_blockage": true, "blocking_zone_id": <that
        zone_id>, "reason": "currently_high_risk"}.
     b) Else, if simulated_steps is provided (reuse
        PanicDiffusionModel.simulate_steps output), checks the first
        near_term_step_count steps for any zone in zone_sequence
        crossing into "high"/"critical" territory (risk_score >= 0.55)
        -> if so, {"at_risk_of_blockage": true, "blocking_zone_id":
        <that zone_id>, "reason": "predicted_high_risk_within_simulation"}.
     c) Else {"at_risk_of_blockage": false, "blocking_zone_id": null,
        "reason": null}.
     Returns the full list of route dicts each merged with these
     blockage fields, matching the route_blockage_predictions schema
     documented above.
   - This module's output is intended to be consumed by the Phase 4
     backend and exposed via GET /api/zones or a dedicated
     /api/routes endpoint so Phase 6's mobile safe-route navigation can
     avoid not just the user's CURRENT zone but any zone on their
     planned path that's about to become dangerous.

7. `scripts/pipeline.py` — orchestrator `RiskEngine` class that:
   - Wraps RiskScorer + PanicDiffusionModel + ResourceAllocator +
     RouteBlockagePredictor into one `process_frame(cv_pipeline_frame_json,
     known_routes: list[dict] = None) -> dict` method matching this
     EXACT final output schema:
     {
       "timestamp": ...,
       "zones": [{"zone_id":..., "risk_score":..., "risk_level":...,
         "contributing_factors": {...}}],
       "panic_propagation": {"simulated_steps": [...]},
       "predicted_crush_timeline": [...],
       "resource_allocation_suggestions": [...],
       "route_blockage_predictions": [...]
     }
   - Has a CLI entry point (argparse) that reads a Phase 1 output JSON file
     (array of frames) and runs process_frame on each, writing a matching
     array of Phase 2 outputs to an output file. Also supports a
     `--pre-event` flag that instead runs PreEventSimulator given a zones
     config and --attendance number, ignoring the input frames file.

Include unit tests (pytest, in ai_core/risk_engine/tests/) for:
- RiskScorer.compute_risk_score with hand-crafted inputs verifying weight math
- PanicDiffusionModel.simulate_steps confirming risk only spreads to zones
  with crowd_count > 0
- ResourceAllocator.suggest_allocations returns exactly top_n + historical
  zones, no duplicates
- RouteBlockagePredictor.predict_blockages correctly flags a route as
  at-risk when ANY zone along it (not just the origin or destination) is
  high/critical, and correctly returns false when no zone on the route is
  currently or predicted to be at risk

Add a README.md in ai_core/risk_engine/ explaining the weight constants are
tunable and documenting how to adjust them for Phase 8 fine-tuning against
real demo footage.
```

---

## Test Cases — Phase 2

| # | Test | Expected Result |
|---|---|---|
| 2.1 | Feed a single frame with all zones at low density (<0.2), no anomalies | All `risk_score` values <0.3, `risk_level: "low"` |
| 2.2 | Feed a frame with one zone at density 0.9 + `bottleneck_detected: true` | That zone's `risk_score` is high/critical (>0.6), noticeably higher than neighbors |
| 2.3 | Feed a sequence of 10 frames with steadily increasing density in one zone | `density_rate_of_change` component increases across frames; overall `risk_score` trends upward |
| 2.4 | Feed a sequence where density *decreases* | `density_rate_of_change` stays at 0 (never negative), confirming only increases raise risk |
| 2.5 | Construct adjacent zones where neighbor flow vectors all point toward a central zone | `flow_convergence_score` for the central zone is high (>0.6) |
| 2.6 | Run `PanicDiffusionModel.simulate_steps` where a neighbor zone has `crowd_count: 0` | That empty neighbor's risk score does NOT increase from diffusion, confirming the crowd_count gate works |
| 2.7 | Run `simulate_steps` for 10 steps on a single high-risk zone with populated neighbors | Neighbor risk scores increase monotonically across steps (before decay dominates), demonstrating visible "spread" |
| 2.8 | Run `predict_crush_timeline` on a simulation where a zone crosses 0.75 by step 5 | Returns a timeline entry for that zone with the correct `predicted_critical_at_seconds` |
| 2.9 | Run `PreEventSimulator.simulate_arrival_buildup` with `expected_attendance=5000` on a small 3x3 zone grid with 1 entry zone | Entry zone density climbs steadily; congestion visibly diffuses into adjacent zones over the simulated steps |
| 2.10 | Run `ResourceAllocator.suggest_allocations` on scored zones with a clear single highest-risk zone | That zone appears first in suggestions with `priority: "high"` and a reason string referencing its dominant contributing factor |
| 2.11 | Run `find_routes_to_exits` on a zone grid with one zone tagged `is_exit: true` | Every other zone gets a route whose `zone_sequence` correctly ends at the exit zone via the shortest adjacency path |
| 2.12 | Run `predict_blockages` where a MIDDLE zone of a 3-zone route (not the origin or destination) is critical | That route is correctly flagged `at_risk_of_blockage: true` with `blocking_zone_id` pointing at the middle zone, confirming the check isn't just endpoint-based |
| 2.13 | Run `predict_blockages` where no zone on any route is high/critical, with no simulated_steps provided | All routes return `at_risk_of_blockage: false` |
| 2.14 | Run `predict_blockages` with a currently-calm route but where `simulated_steps` shows a zone on it crossing into "critical" within the near-term window | Route flagged `at_risk_of_blockage: true` with `reason: "predicted_high_risk_within_simulation"`, distinguishing predicted vs. current blockage |
| 2.15 | Run the full `RiskEngine.process_frame` on a real Phase 1 output file | Produces valid JSON matching the full Phase 2 schema (including `route_blockage_predictions`), no missing fields, no exceptions |
| 2.16 | Run all pytest unit tests | All pass |

## Phase 2 Checklist

- [ ] Zone adjacency correctly computed from `bounds_normalized` (not hardcoded from naming)
- [ ] Risk scoring formula implemented with configurable, documented weight constants
- [ ] Density rate-of-change correctly clamps negative changes to zero
- [ ] Flow convergence score computed from neighbor zones' flow directions
- [ ] Risk level bucketing (low/moderate/high/critical) matches documented thresholds
- [ ] Panic diffusion model respects the "no diffusion into empty zones" rule
- [ ] Fast-forward simulation produces multi-step snapshots with correct time offsets
- [ ] Predicted crush timeline correctly identifies threshold-crossing zones and timing
- [ ] Pre-event offline simulator works from hypothetical attendance numbers, no live camera needed
- [ ] Resource allocation suggestions reference specific, human-readable reasons tied to contributing factors
- [ ] `RouteBlockagePredictor` correctly derives routes to exits via adjacency BFS and supports custom hand-defined routes
- [ ] Route blockage detection checks ALL zones along a route (not just endpoints) and distinguishes current vs. predicted blockage reasons
- [ ] Mock historical dataset generator implemented and clearly labeled as demo-only mock data
- [ ] Full `RiskEngine.process_frame` orchestrator produces schema-exact output
- [ ] CLI supports both live-frame-file mode and `--pre-event` offline mode
- [ ] Unit tests written and passing for scorer, diffusion, and allocator
- [ ] README documents weight tuning process for Phase 8

## Common Pitfalls

- **Circular import risk between Phase 1 and Phase 2 zone configs**: keep zone definitions (the `Zone` dataclass / adjacency logic) in `ai_core/shared/` if both phases need to reference the same zone objects, rather than duplicating zone logic in each phase's folder.
- **Diffusion runaway**: if `diffusion_rate` is set too high relative to `decay_rate`, simulated risk scores can saturate to 1.0 for every zone within a few steps, making the simulation useless for demo purposes (everything looks equally critical). Always sanity-check simulation output visually (or via test 2.7) before wiring it into the dashboard.
- **Weights don't need to be "correct," they need to be *defensible* in a pitch** — judges will ask "how did you decide these weights?" Have an answer ready: they're heuristic-initialized based on domain literature on crowd crush precursors (density + convergence + rate-of-change are well-documented risk factors in crowd safety research), and are tuned empirically against demo footage in Phase 8.
- **Don't confuse `risk_score` (real-time, current) with `predicted_crush_timeline` (future, simulated)** in the dashboard later — keep these visually distinct so a judge doesn't think a "predicted" risk is already happening.
- **`RouteBlockagePredictor` needs `is_exit: true` tagging on the zone config before it can compute anything** — if no zone in a given demo video's zone config is tagged as an exit, `find_routes_to_exits` has nothing to route toward. Add this tagging as part of Phase 8's per-video zone-layout calibration (Track A.1), not as an afterthought right before Phase 6 needs it.
---

# Phase 3: Generative AI, Recommendations & Voice Pipeline (AI/ML Core 3)

## Goal
Convert numerical risk data (Phase 2 output) into human-actionable intelligence: LLM-generated tactical recommendations, auto-generated incident summaries, multilingual translated announcements with text-to-speech audio, a mocked social-media sentiment analysis layer, and a speech-to-text voice command layer for the control room.

This corresponds to **Features.md → Section 3: Intelligent Recommendations** (in full), **Section 6 Bonus Features → Voice Command Center, Multilingual AI Assistant, Generative AI Summaries**, and **Nice-to-Have → Sentiment Analysis via Social Media**.

## Prerequisites
- Phase 2 complete and producing valid risk-scored JSON
- Gemini API key (primary) and optionally Claude API key (supplementary) working
- `faster-whisper`, `edge-tts` or `gTTS` installed

---

## Sub-steps

### Step 3.1: Intelligent Recommendations & Incident Summaries (LLM Layer)

**What this does:** structured prompt templates that take Phase 2's risk data (contributing factors, risk level, panic propagation, resource suggestions) and ask an LLM to translate that into specific, actionable, human-readable interventions — going beyond the heuristic resource allocator by reasoning over the *combination* of factors the way a human safety officer would.

**Design principle — structured output, not freeform chat:** every LLM call in this phase must request and validate JSON output (using Gemini's JSON mode / response schema, or explicit "respond only with valid JSON matching this schema" prompting + a parsing/retry wrapper), because the dashboard (Phase 5) needs to bind these fields to UI components deterministically — freeform LLM prose can't be reliably rendered as clickable "one-click announcement" buttons.

Two distinct LLM call types:
1. **Real-time intervention recommendations** — triggered when a zone crosses a risk threshold; asks the LLM for 2–4 specific interventions (gate closures, personnel redeployment, alternative evacuation routes) given the current zone state and its neighbors.
2. **Post-incident summary generation** — triggered on-demand (or automatically when an incident resolves, i.e. risk drops back below threshold after having been critical) to produce a structured, readable incident report from the full time-series of what happened.

### Step 3.2: Multilingual Announcement & TTS Generation

**What this does:** given a base English alert message (either LLM-generated or operator-authored), uses the LLM to translate it into a configurable list of regional languages (e.g. Hindi, Tamil, Telugu, Bengali, Marathi — relevant for the India context described in Project_Idea.md), then feeds each translated string into Edge-TTS (preferred, higher quality, free) or gTTS (fallback) to produce ready-to-broadcast `.mp3`/`.wav` audio files.

### Step 3.3: Voice-Enabled Command Center (STT Layer)

**What this does:** integrates Faster-Whisper to capture operator microphone audio locally, transcribe it to text, and map recognized commands/phrases to dashboard actions (e.g. "show zone A1", "broadcast evacuation alert to zone B", "what's the current risk level") via simple intent-matching (keyword/regex-based intent classification is sufficient for hackathon scope — a full NLU model is out of scope).

### Bonus: Sentiment Analysis (mocked)

**What this does:** since live X/Twitter API access is heavily rate-limited on free tiers (correctly identified as a constraint in Tech_Stack.md), this uses a small mocked/sample dataset of social media-style posts (hand-authored, representing realistic patterns like complaints about long lines, panic-related keywords, dehydration mentions) and scores each for sentiment/urgency via the LLM, demonstrating the *pipeline* (mock posts → LLM sentiment scoring → aggregated unrest indicator) which would swap to a live API in production.

### Phase 3 Deliverable — Output JSON Schemas

**Recommendation output:**
```json
{
  "zone_id": "zone_A1",
  "risk_level": "critical",
  "recommendations": [
    {
      "action": "Close entry gate 3 and redirect incoming visitors to gate 5",
      "category": "flow_management",
      "urgency": "immediate",
      "reasoning": "Zone A1 shows high flow convergence from 3 adjacent zones with density above 0.7"
    }
  ],
  "generated_at": "2026-08-03T14:32:15Z"
}
```

**Multilingual announcement output:**
```json
{
  "base_message_en": "Please move calmly toward Exit B. Avoid Zone A1.",
  "translations": {
    "hi": {"text": "कृपया शांति से निकास बी की ओर बढ़ें...", "audio_path": "audio/alert_hi_20260803.mp3"},
    "ta": {"text": "...", "audio_path": "audio/alert_ta_20260803.mp3"}
  },
  "generated_at": "2026-08-03T14:32:20Z"
}
```

**Voice command output:**
```json
{
  "transcribed_text": "show me zone A1",
  "matched_intent": "navigate_to_zone",
  "intent_params": {"zone_id": "zone_A1"},
  "confidence": "high"
}
```

**Sentiment analysis output:**
```json
{
  "analyzed_at": "2026-08-03T14:32:00Z",
  "posts_analyzed": 12,
  "aggregated_unrest_score": 0.64,
  "flagged_posts": [
    {"text": "so packed near the main stage, can't breathe", "sentiment": "distress", "urgency": "high"}
  ]
}
```

---

## Vibe Coding Prompt — Phase 3

```
I'm building the generative AI layer for CrowdShield, a hackathon crowd-safety
project. This layer consumes JSON output from a risk engine (Phase 2) with
this schema:

{
  "timestamp": ..., "zones": [
    {"zone_id":"zone_A1", "risk_score":0.82, "risk_level":"critical",
     "contributing_factors": {"density_score":0.71,
       "density_rate_of_change":0.15, "flow_convergence_score":0.60,
       "bottleneck_indicator":1.0, "anomaly_indicator":0.33}}
  ],
  "panic_propagation": {"simulated_steps": [...]},
  "predicted_crush_timeline": [...],
  "resource_allocation_suggestions": [...]
}

Work inside ai_core/genai_pipeline/. Use the google-generativeai package
(Gemini) as primary LLM, with an anthropic-based fallback/supplementary
option. Load API keys from environment variables (GEMINI_API_KEY,
ANTHROPIC_API_KEY) via python-dotenv. Build:

1. `scripts/llm_client.py` — an abstraction layer `LLMClient` class that:
   - Has a unified method `generate_json(prompt: str, schema_hint: str,
     model="gemini") -> dict` that calls Gemini's API requesting JSON output
     (use Gemini's generation_config with response_mime_type="application/json"
     if using the google-generativeai SDK's JSON mode; otherwise instruct via
     prompt "Respond ONLY with valid JSON matching this schema, no markdown
     fences, no preamble: {schema_hint}").
   - Implements a retry wrapper (max 2 retries) that catches JSON parse
     failures and re-prompts with an added "Your last response was not valid
     JSON. Return ONLY the JSON object." instruction.
   - Has a `model="claude"` option using the anthropic SDK
     (claude-sonnet-4-6 model string) for the same generate_json interface,
     so the rest of the codebase can swap models via a parameter without
     changing call sites.
   - Include a simple in-memory rate limiter / backoff (exponential, max 3
     attempts) to handle free-tier rate limit errors gracefully without
     crashing the whole pipeline.

2. `scripts/recommendation_engine.py` — a `RecommendationEngine` class:
   - Method `generate_recommendations(zone_risk_data: dict,
     neighbor_zones_data: list[dict] = None) -> dict` that builds a
     structured prompt including the zone's risk_level, all
     contributing_factors with their values, and (if provided)
     a brief summary of neighboring zones' states, then asks the LLM:
     "You are a crowd safety advisor for event control room operators.
     Given this zone's risk data, suggest 2-4 SPECIFIC, ACTIONABLE
     interventions. For each: action (imperative sentence, e.g. 'Close
     entry gate 3', 'Institute one-way pedestrian flow from the north
     entrance toward the main exit', 'Redirect incoming visitors to gate
     5'), category (one of: flow_management, resource_deployment,
     crowd_control, communication), urgency (immediate/soon/monitor), and
     reasoning (1 sentence referencing the SPECIFIC contributing factor
     driving this recommendation). When flow_convergence_score is the
     dominant contributing factor (multiple neighboring zones' crowd flow
     is converging into this zone), explicitly consider recommending
     one-way pedestrian flow or a flow-direction change as one of the
     interventions, since that factor specifically indicates a
     multi-directional convergence problem better solved by directing
     flow than by closing a single gate. Return JSON:
     {"recommendations": [...]}"
   - Parses and validates the LLM response matches expected structure
     (list of dicts with the 4 required keys); on validation failure,
     falls back to a hardcoded generic recommendation
     ("Increase monitoring of this zone", category "monitor", urgency
     "soon") rather than crashing, so the demo never breaks from a bad
     LLM response.
   - Returns final schema:
     {"zone_id":..., "risk_level":..., "recommendations":[...],
      "generated_at": <ISO timestamp>}

3. `scripts/incident_summary.py` — an `IncidentSummaryGenerator` class:
   - Method `generate_summary(zone_id: str, time_series_data: list[dict],
     resolution_status="resolved") -> dict` that takes a list of
     historical risk-scored frames for one zone (a mini time series showing
     how risk_score evolved), and prompts the LLM to write a structured
     post-incident summary: peak_risk_score reached, approximate duration
     the zone was above "high" risk_level, likely contributing cause (in
     plain English, synthesized from the contributing_factors trend), and
     a one-paragraph narrative summary suitable for a post-event report.
   - Returns JSON: {"zone_id":..., "peak_risk_score":..., "duration_at_risk
     _seconds":..., "likely_cause":..., "narrative_summary":...,
     "generated_at":...}

4. `scripts/translation_tts.py` — a `MultilingualAnnouncer` class:
   - Method `translate_message(base_message_en: str, target_languages:
     list[str] = ["hi","ta","te","bn","mr"]) -> dict` that prompts the LLM
     once per language (or, if the SDK supports it, one batched call
     requesting a JSON object mapping language code -> translated string)
     with: "Translate this public safety announcement into
     {language_name}. Keep it clear, calm, and appropriate for a public
     announcement system. Preserve the urgency but do not add extra
     information. Respond with only the translated text, no explanation."
   - Method `generate_audio(translated_text: str, language_code: str,
     output_dir="ai_core/genai_pipeline/audio_output/") -> str` that uses
     edge-tts (preferred; use appropriate per-language voice names, e.g.
     hi-IN-MadhurNeural for Hindi, ta-IN-PallaviNeural for Tamil — look up
     correct edge-tts voice identifiers for each of the 5 target languages)
     to synthesize speech and save as an mp3, returning the file path. If
     edge-tts fails (e.g. no network), fall back to gTTS with the
     corresponding language code (hi, ta, te, bn, mr).
   - Method `create_multilingual_alert(base_message_en: str,
     target_languages=["hi","ta","te","bn","mr"]) -> dict` orchestrating
     both of the above into final schema:
     {"base_message_en":..., "translations": {"hi": {"text":...,
      "audio_path":...}, ...}, "generated_at":...}
   - Make this ASYNC (async def) using asyncio, since edge-tts is
     natively async and translating+synthesizing 5 languages sequentially
     would be slow — run the 5 languages concurrently with
     asyncio.gather().
   - Method `format_for_social_channels(multilingual_alert: dict,
     platforms=["X","Instagram"]) -> dict` implementing the "social
     channels" half of the Communication Triggers feature (Features.md
     explicitly says announcements broadcast "through mobile and social
     channels" — mobile is covered by FCM push in Phase 6, this method
     covers social). Since posting to real X/Instagram accounts requires
     verified developer app credentials out of scope for a hackathon,
     this SIMULATES the dispatch: for each platform, formats the
     base_message_en (and, space permitting, one translation) into a
     platform-appropriate short-form string (respect a rough character
     budget, e.g. 280 chars for X), and returns
     {"platform":..., "formatted_text":..., "status":
      "simulated_post"} per platform — clearly commented as a SIMULATED
     social broadcast for hackathon scope, structured so a real posting
     API call could be substituted in directly later without changing
     the calling code.

5. `scripts/sentiment_analysis.py` — a `SentimentAnalyzer` class:
   - Function `generate_mock_social_posts() -> list[dict]` returning 10-15
     HARDCODED realistic mock social media posts as
     {"text":..., "platform": "X"|"Instagram", "timestamp":...}, covering a
     spread of sentiments (a few clearly panicked/distressed, a few
     neutral/positive, a few complaining about lines/heat/water) — clearly
     comment this as MOCK DATA FOR HACKATHON DEMO, since live API access
     is rate-limited on free tiers.
   - Method `analyze_posts(posts: list[dict]) -> dict` that sends the
     batch of posts to the LLM in ONE call (not one call per post, for
     efficiency) asking it to classify each post's sentiment
     (calm/concerned/distress/panic) and urgency (low/medium/high), then
     compute an aggregated_unrest_score (0-1) as a weighted average
     (distress=0.7, panic=1.0, concerned=0.4, calm=0.0 weight per post,
     averaged). Return schema:
     {"analyzed_at":..., "posts_analyzed": <int>,
      "aggregated_unrest_score":...,
      "flagged_posts": [only posts with urgency "high" or "medium",
        each as {"text":..., "sentiment":..., "urgency":...}]}

6. `scripts/voice_commands.py` — a `VoiceCommandProcessor` class:
   - Method `transcribe_audio(audio_file_path: str) -> str` using
     faster-whisper (load model size "base" or "small" for speed) to
     transcribe a local audio file to text.
   - Method `match_intent(transcribed_text: str) -> dict` implementing
     simple keyword/regex-based intent matching (NOT an LLM call — this
     should be fast/local) for at least these intents:
     - "show/display/go to zone {X}" -> {"matched_intent":
       "navigate_to_zone", "intent_params": {"zone_id": "zone_{X}"}}
     - "what is the risk level" / "current risk" -> {"matched_intent":
       "query_risk_status", "intent_params": {}}
     - "broadcast" / "announce" / "send alert" -> {"matched_intent":
       "trigger_announcement", "intent_params": {}}
     - "close gate {N}" -> {"matched_intent": "close_gate",
       "intent_params": {"gate_number": N}}
     - no match -> {"matched_intent": "unrecognized", "intent_params": {}}
     Return confidence "high" for clear keyword matches, "low" for
     unrecognized.
   - Method `process_voice_command(audio_file_path) -> dict` orchestrating
     both, returning:
     {"transcribed_text":..., "matched_intent":..., "intent_params":...,
      "confidence":...}
   - Include a simple CLI test mode that records a few seconds from the
     default microphone (using sounddevice or similar, gracefully handle
     if no mic available in a server/Colab environment) and runs it
     through the pipeline, printing the result.
   - IMPORTANT — this class only RECOGNIZES intents; it must not answer
     them. Recognized intents like "query_risk_status" or
     "navigate_to_zone" are dispatched by the caller (the backend's
     /api/voice-command route, built in Phase 4) against LIVE state (the
     current risk-scored zones), not against anything voice_commands.py
     itself knows. Do not hardcode a canned answer here.

8. `scripts/voice_query_responder.py` — a small `VoiceQueryResponder`
   class implementing the answering half of the "Multilingual AI
   Assistant" feature (querying data by voice, not just recognizing
   commands):
   - Method `answer_query(matched_intent: str, intent_params: dict,
     current_zone_risk_data: list[dict]) -> dict` that, given the
     CURRENT risk-scored zones (passed in by the caller — this class has
     no state of its own), handles at minimum:
     - "query_risk_status" with no zone_id in intent_params: finds the
       single highest-risk zone across current_zone_risk_data and
       returns a natural-language answer, e.g. "Zone A1 currently has
       the highest risk at 0.82, critical level, driven mainly by high
       flow convergence."
     - "query_risk_status" with a zone_id present (extend
       match_intent's regex in voice_commands.py to also capture an
       optional zone_id for phrases like "what's the risk in zone A1"):
       returns that specific zone's current risk_score, risk_level, and
       its single dominant contributing_factors key in one sentence.
     Compose the sentence via a short LLM call for natural phrasing (fall
     back to a simple f-string template if the LLM call fails, so a voice
     query never returns an empty/broken answer), returning
     {"answer_text": <string>, "zone_id": <string or null>}.
   - Method `answer_to_speech(answer_text: str, language_code="en") ->
     str` reusing MultilingualAnnouncer's `generate_audio` (from
     translation_tts.py) to speak the answer back, so an operator can
     ask a question hands-free and hear a spoken response rather than
     only reading recognized-intent JSON — this closes the loop from
     "voice command recognition" to an actual "multilingual AI
     assistant" the operator can converse with.

7. `scripts/pipeline.py` — orchestrator `GenAIPipeline` class tying
   RecommendationEngine, IncidentSummaryGenerator, MultilingualAnnouncer,
   SentimentAnalyzer, and VoiceCommandProcessor together with a simple
   unified interface, plus a CLI (argparse) supporting subcommands:
   `recommend`, `summarize`, `announce`, `sentiment`, `voice`, each taking
   appropriate file/text inputs and printing JSON output.

Add a .env.example addition confirming GEMINI_API_KEY and
ANTHROPIC_API_KEY are required. Add error handling everywhere: every LLM
call must have a try/except with a sensible fallback so a live demo never
crashes from an API hiccup or rate limit — this is critical since the demo
depends on this pipeline running live in front of judges.

Add unit tests (pytest) with MOCKED LLM responses (do not call real APIs
in tests) verifying: recommendation_engine falls back gracefully on
malformed LLM JSON, sentiment aggregation math is correct given known
mock sentiment classifications, and voice intent matching correctly
classifies each of the 5 example intents above plus an unrecognized
phrase.
```

---

## Test Cases — Phase 3

| # | Test | Expected Result |
|---|---|---|
| 3.1 | Call `generate_recommendations` on a hand-crafted `critical` risk zone | Returns 2–4 recommendations, each with all 4 required fields, urgency mostly "immediate" |
| 3.2 | Call `generate_recommendations` on a `low` risk zone | LLM still returns valid structured output (even if recommendations lean toward "monitor") |
| 3.3 | Force a malformed/non-JSON LLM response (mock it) | Fallback generic recommendation returned, no crash |
| 3.4 | Call `generate_summary` on a synthetic time series showing risk climbing then falling | `peak_risk_score` matches the actual max in the series; narrative is coherent and references the right zone |
| 3.5 | Call `translate_message` with a simple English alert | Returns non-empty translated text for all 5 target languages, each visually distinct/plausible as different languages |
| 3.6 | Call `generate_audio` for each of the 5 languages | Produces valid, playable `.mp3` files (non-zero byte size, playable in a media player) |
| 3.7 | Disconnect network / force edge-tts failure (simulate) | Falls back to gTTS without crashing the pipeline |
| 3.8 | Run `analyze_posts` on the mock post dataset | `aggregated_unrest_score` reflects the mix (e.g. if 3/12 posts are "panic", score should be meaningfully >0, not near 0) |
| 3.9 | Run `analyze_posts` and inspect `flagged_posts` | Only medium/high urgency posts appear, correctly excludes calm/neutral posts |
| 3.10 | Feed a WAV/MP3 recording of "show me zone A1" through `process_voice_command` | `transcribed_text` roughly matches spoken words; `matched_intent: "navigate_to_zone"`, `zone_id: "zone_A1"` |
| 3.11 | Feed audio saying something unrelated (e.g. reading a grocery list) | `matched_intent: "unrecognized"`, no crash |
| 3.12 | Call `answer_query` with `matched_intent: "query_risk_status"` and no zone_id, against a set of zones with one clear highest-risk zone | Returns a natural-language answer correctly naming that zone and its risk level |
| 3.13 | Call `answer_query` with a specific `zone_id` in `intent_params` | Answer references that exact zone's current risk_score/risk_level, not the venue-wide highest |
| 3.14 | Force the LLM call inside `answer_query` to fail (mock it) | Falls back to the f-string template answer, never returns an empty/broken response |
| 3.15 | Call `answer_to_speech` on a generated answer | Produces a valid, playable audio file |
| 3.16 | Run the full `GenAIPipeline` CLI for each subcommand | All produce valid JSON output |
| 3.17 | Run all pytest unit tests (mocked LLM) | All pass |
| 3.18 | Time a full `create_multilingual_alert` call (5 languages) | Completes in a reasonable demo-friendly time (test whether asyncio concurrency meaningfully speeds this up vs. sequential) |

## Phase 3 Checklist

- [ ] `LLMClient` abstraction supports both Gemini and Claude with identical interface
- [ ] JSON-mode / schema-constrained prompting implemented with retry-on-parse-failure
- [ ] `RecommendationEngine` produces specific, factor-referencing recommendations
- [ ] Fallback recommendation logic prevents pipeline crash on bad LLM output
- [ ] `IncidentSummaryGenerator` produces coherent, data-grounded narrative summaries
- [ ] Multilingual translation covers at least 5 relevant Indian regional languages
- [ ] TTS audio generation works via Edge-TTS with gTTS fallback
- [ ] Multilingual pipeline runs concurrently (asyncio) for demo-acceptable speed
- [ ] Sentiment analysis mock dataset is realistic and clearly labeled as mock
- [ ] Sentiment aggregation scoring math verified correct via unit test
- [ ] Voice command STT (Faster-Whisper) transcribes local audio correctly
- [ ] Intent matching correctly handles all defined intents + unrecognized case
- [ ] `VoiceQueryResponder` answers "query_risk_status" queries (venue-wide and per-zone) with natural-language, data-grounded responses, with a non-LLM fallback template
- [ ] Answered queries can be spoken back via TTS, completing the voice-in/voice-out "Multilingual AI Assistant" loop, not just one-way command recognition
- [ ] Every LLM call wrapped in error handling with sensible fallback (no live-demo crash risk)
- [ ] Full `GenAIPipeline` CLI works for all 5 subcommands
- [ ] Unit tests pass using mocked LLM responses (no real API calls in test suite)

## Common Pitfalls

- **LLM JSON mode isn't always perfectly reliable** — always validate the parsed structure (right keys, right types) before trusting it downstream, not just that `json.loads()` didn't throw. A response that's valid JSON but missing the `reasoning` key will still break the dashboard binding later.
- **Rate limits on free-tier Gemini/Claude keys** — a live demo making rapid successive calls (e.g. re-triggering recommendations every few seconds as risk updates) can hit rate limits mid-pitch. Cache/debounce: only call the LLM when a zone's risk_level *changes* (e.g. moderate→high), not on every single frame update.
- **edge-tts requires network access** — if the demo venue has unreliable WiFi, pre-generate and cache the multilingual audio files for your specific demo script/scenario in Phase 7 rather than relying on live generation during the pitch.
- **Faster-Whisper model size tradeoff** — "base" is fast but less accurate on accented English or code-switched Hindi-English speech; "small" is more accurate but slower. Test both against your actual operator's voice/accent before the demo and pick accordingly.
- **Don't let sentiment analysis look like a live Twitter integration** — be upfront in the pitch that this uses a mocked dataset standing in for a rate-limited live API, demonstrating the pipeline architecture rather than claiming live social monitoring; judges will ask, and pretending otherwise undermines credibility.
---

# Phase 4: Backend Orchestration & Real-Time Data Pipeline

## Goal
Wire the three AI/ML cores (Phases 1–3) into a single FastAPI application with a persistent Supabase database, REST endpoints, and WebSocket streaming — turning three separate Python scripts into one coherent, continuously-running system that the dashboard and mobile app can connect to.

This corresponds to **Features.md → Section 4 (Command Dashboard, data-serving side)**, the **Weather Integration** nice-to-have, and is the connective tissue enabling every frontend feature in Sections 4 and 5.

## Prerequisites
- Phases 1, 2, and 3 complete and independently tested
- Supabase project created (Phase 0)
- OpenWeatherMap API key working

---

## Sub-steps

### Step 4.1: Database Schema & Supabase Setup

Tables (all in Supabase/Postgres):

- **`zones`** — static venue zone definitions: `zone_id (PK)`, `venue_id`, `bounds_normalized (jsonb)`, `max_expected_count (int)`, `adjacency (jsonb array of zone_ids)`, `created_at`
- **`crowd_metrics`** — time-series Phase 1 + Phase 2 output, one row per zone per processed frame: `id (PK)`, `zone_id (FK)`, `timestamp`, `crowd_count`, `density_score`, `avg_flow_speed`, `avg_flow_direction_deg`, `risk_score`, `risk_level`, `anomaly_flags (jsonb)`, `contributing_factors (jsonb)`
- **`risk_alerts`** — discrete alert events (created when a zone crosses a risk threshold): `id (PK)`, `zone_id (FK)`, `triggered_at`, `resolved_at (nullable)`, `peak_risk_score`, `risk_level_at_trigger`, `recommendations (jsonb)`, `status (active/resolved)`
- **`incident_reports`** — citizen-submitted reports from the mobile app (Phase 6) AND auto-generated post-incident summaries (Phase 3): `id (PK)`, `source (citizen/ai_generated)`, `zone_id (FK, nullable)`, `submitted_at`, `gps_coordinates (jsonb, nullable)`, `photo_url (nullable)`, `notes`, `ai_summary (jsonb, nullable)`
- **`interventions`** — a log of actions taken (manually by operators or one-click from AI recommendations): `id (PK)`, `zone_id (FK)`, `action_taken`, `category`, `triggered_by (operator/ai_suggested)`, `timestamp`

Enable Supabase's built-in Realtime feature on `crowd_metrics` and `risk_alerts` (used later as a secondary sync path alongside native WebSockets, and directly by the mobile app for incident report sync in Phase 6).

### Step 4.2: FastAPI Backend Core

Build the FastAPI app as the **single orchestration point**: it owns the "run the AI pipeline on a video source" loop, calling into `ai_core/cv_pipeline`, `ai_core/risk_engine`, and `ai_core/genai_pipeline` as imported Python modules (not subprocess calls — same-language, same-process, direct function calls are faster and simpler for a hackathon build than a microservices split).

REST endpoints to expose:
- `POST /api/incidents` — citizen or operator incident submission (Section 5 mobile app feature)
- `POST /api/simulations/pre-event` — trigger a Phase 2 offline stress-test simulation
- `GET /api/trends/{zone_id}` — historical trend query (backs Phase 5 Recharts analytics)
- `GET /api/zones` — fetch venue zone configuration
- `POST /api/zones` — create/update zone configuration (venue setup)
- `POST /api/announcements` — trigger a Phase 3 multilingual announcement (one-click broadcaster)
- `POST /api/voice-command` — accept an audio upload, run Phase 3 voice pipeline, return matched intent
- `GET /api/sentiment` — fetch latest mocked sentiment analysis snapshot
- `POST /api/webhooks/signage` — the "Visual Alert System Integration" simulated webhook trigger

### Step 4.3: Real-Time WebSockets

A single WebSocket endpoint (`/ws/live`) broadcasting a continuous stream of combined Phase 1 + Phase 2 + (as-needed) Phase 3 output to every connected client (dashboard, and optionally mobile) as the video-processing loop runs. Use FastAPI's native WebSocket support with a simple connection-manager pattern (a class tracking active connections, broadcasting to all).

### Step 4.4: External Data Integration (Weather)

A background task polling OpenWeatherMap periodically (e.g. every 5–10 minutes — free tier rate limits apply) for the venue's location; when adverse weather (rain, storm) is detected, this **injects an artificial risk multiplier** into Phase 2's risk scoring for outdoor zones (a simple configurable multiplier, e.g. `risk_score *= 1.15` when rain is active) and triggers a proactive alert through the same alert pipeline as a camera-detected risk.

---

## Vibe Coding Prompt — Phase 4a: Database & Models

```
I'm building the FastAPI backend for CrowdShield, a hackathon crowd-safety
project. Work inside backend/. We're using Supabase (Postgres) as the
database via the supabase-py client.

1. Create backend/app/models/schema.sql containing CREATE TABLE statements
   for these 5 tables (use Postgres syntax, UUID primary keys with
   gen_random_uuid() default, timestamptz for all timestamps, jsonb for
   structured fields):

   - zones: zone_id (text, PK), venue_id (text), bounds_normalized (jsonb),
     max_expected_count (int default 50), adjacency (jsonb, array of zone_id
     strings), created_at (timestamptz default now())

   - crowd_metrics: id (uuid PK), zone_id (text, FK -> zones.zone_id),
     timestamp (timestamptz), crowd_count (int), density_score (float),
     avg_flow_speed (float), avg_flow_direction_deg (float), risk_score
     (float), risk_level (text), anomaly_flags (jsonb), contributing_factors
     (jsonb)

   - risk_alerts: id (uuid PK), zone_id (text FK), triggered_at (timestamptz),
     resolved_at (timestamptz nullable), peak_risk_score (float),
     risk_level_at_trigger (text), recommendations (jsonb), status (text,
     default 'active')

   - incident_reports: id (uuid PK), source (text, 'citizen' or
     'ai_generated'), zone_id (text FK nullable), submitted_at (timestamptz
     default now()), gps_coordinates (jsonb nullable), photo_url (text
     nullable), notes (text), ai_summary (jsonb nullable)

   - interventions: id (uuid PK), zone_id (text FK), action_taken (text),
     category (text), triggered_by (text, 'operator' or 'ai_suggested'),
     timestamp (timestamptz default now())

   Add indexes on crowd_metrics(zone_id, timestamp) and
   risk_alerts(zone_id, status) since these will be queried frequently for
   trend charts and active-alert lookups.

   Add a comment block at the top with instructions to run this via the
   Supabase SQL Editor, and a note to enable Realtime replication on
   crowd_metrics and risk_alerts via Supabase dashboard settings
   (Database > Replication) since this can't be done via SQL alone.

2. Create backend/app/models/schemas.py with Pydantic models mirroring
   every table above (for request/response validation) PLUS models
   matching the exact Phase 1, Phase 2, and Phase 3 JSON output schemas
   documented in this build guide (CVFrameOutput, RiskEngineOutput,
   RecommendationOutput, MultilingualAlertOutput, SentimentOutput,
   VoiceCommandOutput) so FastAPI route handlers can type-check against
   them.

3. Create backend/app/services/supabase_client.py — a singleton Supabase
   client initialized from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env
   vars (via python-dotenv), with helper functions:
   insert_crowd_metrics(zone_frame_data: dict), insert_risk_alert(alert:
   dict), resolve_risk_alert(alert_id), insert_incident_report(report:
   dict), get_zone_config(venue_id), upsert_zone_config(zones: list[dict]),
   get_trend_data(zone_id, start_time, end_time). Include try/except error
   handling around every Supabase call with logging (use Python's logging
   module, not print) since a demo shouldn't crash from a transient DB
   hiccup — log and continue where reasonable (e.g. a failed metrics insert
   shouldn't kill the live processing loop, just skip that write and move on).

Do not build the FastAPI routes yet — that's the next prompt. This step is
schema + data access layer only.
```

## Vibe Coding Prompt — Phase 4b: FastAPI App, Routes & Orchestration

```
Continue building the CrowdShield backend in backend/. The database layer
(backend/app/services/supabase_client.py) and Pydantic schemas
(backend/app/models/schemas.py) already exist. The AI/ML pipelines exist as
importable Python modules:
- ai_core.cv_pipeline.scripts.pipeline.CVPipeline
- ai_core.risk_engine.scripts.pipeline.RiskEngine
- ai_core.genai_pipeline.scripts.pipeline.GenAIPipeline

Build:

1. backend/app/main.py — the FastAPI app entry point:
   - Instantiate FastAPI() with CORS middleware allowing the dashboard
     (localhost:5173 for dev, plus a configurable production Vercel URL)
     and mobile app origins.
   - Include all routers (below) with appropriate prefixes.
   - On startup (@app.on_event("startup")), initialize a global
     ConnectionManager instance (websockets router) and start the weather
     polling background task (services/weather_service.py, described below).

2. backend/app/services/orchestrator.py — an `EventOrchestrator` class that
   is the CENTRAL loop tying all 3 AI modules together:
   - Method `async def run_live_processing(video_source: str, zones: list,
     websocket_manager, sample_every_n_frames=3)`:
     a) Instantiates CVPipeline with the zones config.
     b) Iterates CVPipeline.process_video(video_source, mode="stream")
        (a generator yielding one Phase 1 JSON frame at a time — reuse the
        streaming mode built in Phase 1).
     c) For each Phase 1 frame, calls RiskEngine.process_frame() to get
        Phase 2 output.
     d) Merges Phase 1 + Phase 2 output into a single combined frame object
        (nest under "cv_data" and "risk_data" keys respectively, plus a
        top-level "timestamp").
     e) Writes crowd_metrics rows to Supabase (one per zone via
        insert_crowd_metrics) — do this async/non-blocking (e.g.
        asyncio.create_task) so it doesn't slow down the live WebSocket
        broadcast loop.
     f) Checks each zone's risk_level: if a zone just crossed INTO
        "high" or "critical" (compare against its previous state, kept in
        an in-memory dict on the orchestrator instance) AND there's no
        already-active alert for that zone, calls
        GenAIPipeline.recommendation_engine.generate_recommendations()
        (async), creates a risk_alerts row via insert_risk_alert, and
        includes the recommendations in the broadcast payload.
        If a zone's risk_level drops back to "low" or "moderate" and it
        HAD an active alert, calls resolve_risk_alert AND triggers
        GenAIPipeline.incident_summary generation for that zone's episode,
        storing it in incident_reports with source="ai_generated".
     g) Broadcasts the combined frame (+ any new alert/recommendation) to
        all connected WebSocket clients via websocket_manager.broadcast().
     h) Add a small asyncio.sleep() between frames if processing faster
        than realtime, to simulate a live camera feed pace during demos
        (configurable, default targets ~10 FPS effective broadcast rate
        so the dashboard animates smoothly without overwhelming the
        WebSocket).
   - Method `async def run_pre_event_simulation(zones, entry_zone_ids,
     expected_attendance)` wrapping RiskEngine's PreEventSimulator for the
     offline planning endpoint.

3. backend/app/websockets/manager.py — `ConnectionManager` class:
   - Tracks active WebSocket connections in a list.
   - `async def connect(websocket)`, `async def disconnect(websocket)`,
     `async def broadcast(message: dict)` (json-serializes and sends to
     all connections, silently dropping any that error/disconnect).

4. backend/app/websockets/routes.py — WebSocket route `/ws/live`:
   - Accepts connections, registers with ConnectionManager, keeps the
     connection open listening for disconnect (the actual data push
     happens from the orchestrator's broadcast calls, not from this
     handler reading anything).

5. backend/app/routers/incidents.py:
   - POST /api/incidents — accepts IncidentReportCreate schema (zone_id
     optional, gps_coordinates, notes, photo_url optional), inserts via
     insert_incident_report, returns the created record.
   - GET /api/incidents — list recent incident reports, optional
     zone_id query param filter.

6. backend/app/routers/simulations.py:
   - POST /api/simulations/pre-event — accepts {zones, entry_zone_ids,
     expected_attendance}, calls
     orchestrator.run_pre_event_simulation(), returns the full simulation
     step output (same shape as Phase 2's PreEventSimulator output) for
     the dashboard/3D twin to render.

7. backend/app/routers/trends.py:
   - GET /api/trends/{zone_id}?start_time=&end_time= — queries
     get_trend_data from Supabase, returns a list of {timestamp,
     density_score, risk_score} points for Recharts.

8. backend/app/routers/zones.py:
   - GET /api/zones?venue_id= — returns zone configs.
   - POST /api/zones — upserts zone configs (venue setup flow); zone
     objects may include an optional `is_exit: bool` field used by the
     route-blockage prediction below.
   - GET /api/routes?venue_id= — returns the current
     `route_blockage_predictions` from the most recent Phase 2
     RiskEngine.process_frame output for this venue (read from an
     in-memory cache the orchestrator updates each frame, not
     recomputed on request, since blockage predictions are already part
     of the per-frame Phase 2 output). This is the endpoint Phase 6's
     mobile safe-route navigation calls to find out which routes to
     avoid, not just which single zone the user is standing in.

9. backend/app/routers/announcements.py:
   - POST /api/announcements — accepts {base_message_en, target_languages
     (optional, defaults to the standard 5), zone_id (optional, for
     logging which zone triggered this), post_to_social (bool, optional,
     default true)}, calls GenAIPipeline's
     MultilingualAnnouncer.create_multilingual_alert(), and if
     post_to_social is true also calls
     format_for_social_channels() on the result. Returns the full
     multilingual + audio-path payload PLUS a "social_channels" key
     containing the simulated per-platform post results, and logs an
     interventions row with category="communication",
     triggered_by="operator" (include a `channels` field in the logged
     interventions row noting which channels this went out on, e.g.
     ["mobile_push", "X", "Instagram"], so the audit trail in
     `interventions` reflects the full multi-channel nature of the
     Communication Triggers feature, not just the TTS/translation part).

10. backend/app/routers/voice.py:
    - POST /api/voice-command — accepts a multipart audio file upload,
      saves it temporarily, runs it through
      GenAIPipeline.voice_commands.process_voice_command(), returns the
      matched intent JSON, then deletes the temp file.

11. backend/app/routers/sentiment.py:
    - GET /api/sentiment — runs (or returns a cached recent result of)
      GenAIPipeline's SentimentAnalyzer on the mock post dataset, returns
      the aggregated result. Cache for 60 seconds (simple in-memory
      cache with a timestamp check) to avoid hammering the LLM API on
      repeated dashboard polling.

12. backend/app/routers/webhooks.py:
    - POST /api/webhooks/signage — accepts {zone_id, message,
      direction_arrows (optional list of compass directions)}, and since
      there's no real signage hardware, SIMULATES the trigger: logs an
      interventions row with category="visual_signage",
      triggered_by="operator", and returns a mock success response
      {"status": "simulated_dispatch", "target_signage_ids": [...]}
      clearly documented in a code comment as a simulated hardware
      integration point for the hackathon (real implementation would POST
      to actual signage vendor APIs).

13. backend/app/services/weather_service.py:
    - `async def poll_weather(lat, lon, api_key, interval_seconds=600)` —
      a background task using OpenWeatherMap's current weather API,
      checking for rain/storm conditions, and when detected, setting a
      simple in-memory flag/multiplier (e.g. a module-level
      `weather_risk_multiplier` variable, default 1.0, set to 1.15 during
      adverse weather) that orchestrator.py reads and applies to
      risk_score for zones tagged "outdoor" in their config before
      broadcasting. Also triggers a proactive risk_alert-style
      notification via the websocket broadcast when weather shifts to
      adverse, independent of any camera-detected risk, labeled
      alert_source="weather".

14. backend/app/routers/video_control.py:
    - POST /api/processing/start — accepts {video_source, zones_config},
      starts orchestrator.run_live_processing as a background asyncio
      task, returns a processing session ID.
    - POST /api/processing/stop — stops the currently running processing
      task.
    - GET /api/processing/status — returns whether processing is
      currently active and basic stats (frames processed, current
      elapsed time).

Wire all routers into main.py. Add a backend/requirements.txt (or confirm
it matches ai_core's shared venv) and a backend/.env.example inheriting
the root .env.example variables plus BACKEND_PORT.

Add basic structured logging throughout (Python logging module) so a
demo-day crash can be diagnosed quickly from console output.

Include a backend/tests/test_routers.py using FastAPI's TestClient with
mocked Supabase and mocked AI pipeline calls, testing that each REST
endpoint returns the correct status code and response shape for valid
input, and a 422 for invalid input (Pydantic validation working).
```

---

## Test Cases — Phase 4

| # | Test | Expected Result |
|---|---|---|
| 4.1 | Run the SQL schema against a fresh Supabase project | All 5 tables created with correct types, no errors |
| 4.2 | `POST /api/zones` with a valid 3x3 zone config, then `GET /api/zones` | Returns the same config back |
| 4.3 | `POST /api/incidents` with valid citizen report data | Row appears in Supabase `incident_reports` table; response includes generated `id` |
| 4.4 | `POST /api/incidents` with missing required fields | Returns HTTP 422 with Pydantic validation error detail |
| 4.5 | `POST /api/processing/start` with a real sample video + zones | Backend begins processing; `GET /api/processing/status` shows `active: true` and increasing `frames_processed` |
| 4.6 | Connect a WebSocket client to `/ws/live` while processing is active | Receives a continuous stream of combined Phase 1+2 JSON frames at a reasonable rate |
| 4.7 | Open two WebSocket connections simultaneously | Both receive identical broadcast messages (confirms multi-client broadcast works — needed for dashboard + mobile both connecting) |
| 4.8 | Feed a video where a zone's density spikes past the critical threshold | A new row appears in `risk_alerts` with `status: "active"`; the WebSocket broadcast includes `recommendations` for that frame |
| 4.9 | Continue feeding video until that zone's risk drops back to "low" | The `risk_alerts` row is updated with `resolved_at` set and `status: "resolved"`; a new `incident_reports` row appears with `source: "ai_generated"` and a populated `ai_summary` |
| 4.10 | `POST /api/announcements` with a base English message | Returns translations + audio paths for all 5 languages, plus a `social_channels` array with simulated X/Instagram post results; an `interventions` row is logged with the multi-channel `channels` field populated |
| 4.11 | `POST /api/voice-command` with an uploaded audio file saying "show zone A1" | Returns correct matched intent; temp audio file is deleted after processing |
| 4.12 | `GET /api/sentiment` called twice within 60 seconds | Second call returns the cached result (verify via timestamp or by checking LLM wasn't called twice — check logs) |
| 4.13 | `POST /api/webhooks/signage` with a zone and message | Returns simulated success response; `interventions` row logged with correct category |
| 4.14 | `GET /api/trends/zone_A1?start_time=X&end_time=Y` after some processing has run | Returns a time-ordered list of density/risk points within the requested window |
| 4.15 | Simulate an OpenWeatherMap "rain" response (mock the API call) | `weather_risk_multiplier` updates; outdoor zones' broadcast risk_score reflects the multiplier; a weather-sourced alert appears on the WebSocket stream |
| 4.16 | Kill the Supabase connection mid-processing (simulate a DB error) | Live processing loop continues (metrics writes fail silently/logged, but WebSocket broadcast keeps flowing) — confirms demo resilience |
| 4.17 | Run `pytest backend/tests/` | All tests pass |
| 4.18 | `POST /api/processing/stop` while active | Processing task halts cleanly; subsequent `GET /api/processing/status` shows `active: false` |

## Phase 4 Checklist

- [ ] All 5 Supabase tables created with correct schema, indexes, and Realtime enabled on `crowd_metrics` + `risk_alerts`
- [ ] Pydantic schemas mirror both DB tables and every upstream AI module's JSON contract exactly
- [ ] Supabase service layer has error handling that doesn't crash the live loop on transient DB failures
- [ ] `EventOrchestrator` correctly chains CV → Risk → GenAI pipelines per frame
- [ ] Alert lifecycle (create on threshold-cross, resolve on drop, generate incident summary) works end-to-end
- [ ] WebSocket `/ws/live` broadcasts to multiple simultaneous clients correctly
- [ ] All REST endpoints implemented and returning correct schemas
- [ ] Weather polling background task correctly applies risk multiplier to outdoor zones only
- [ ] Weather-triggered alerts are distinguishable from camera-detected alerts (`alert_source` field)
- [ ] Signage webhook is clearly documented as simulated (no real hardware dependency)
- [ ] `/api/announcements` covers both mobile and social channels (simulated social posting), matching the full "Communication Triggers" feature scope
- [ ] Voice command endpoint correctly handles file upload → transcribe → intent → cleanup
- [ ] Sentiment endpoint caching prevents redundant LLM calls
- [ ] `/api/processing/start` and `/stop` correctly control the background live-processing task
- [ ] CORS configured correctly for both local dev and deployed dashboard/mobile origins
- [ ] Structured logging in place for demo-day debugging
- [ ] Backend tests pass with mocked Supabase and mocked AI pipeline calls
- [ ] Backend deployed successfully to Render/Railway free tier and reachable via public URL

## Common Pitfalls

- **Free-tier hosting cold starts**: Render/Railway free tiers spin down after inactivity, causing a 20–50 second delay on the first request after idle — **always "wake up" your backend 5–10 minutes before your demo slot** by hitting any endpoint, or the WebSocket connection will appear to hang at the start of your pitch.
- **WebSocket broadcast blocking on slow Supabase writes**: make sure DB writes are truly non-blocking (background tasks / fire-and-forget) relative to the broadcast loop — if `insert_crowd_metrics` is awaited synchronously in the hot loop, a slow DB response will visibly stutter the live dashboard during the demo.
- **CORS misconfiguration is the #1 "works locally, breaks when deployed" bug** — test the deployed backend against the deployed dashboard's actual production URL, not just `localhost`, well before demo day.
- **Alert state must be tracked in-memory per zone** (previous risk_level) to correctly detect *transitions* (crossing into high/critical) rather than re-firing an alert every single frame a zone remains critical — this was specified in the orchestrator design above; don't skip the "already has an active alert" check or you'll spam duplicate alerts and duplicate LLM calls.
- **`sample_every_n_frames` interacts with the `asyncio.sleep()` pacing** — if you process every frame of a 30fps video with no pacing delay, the WebSocket will fire updates faster than any human (or chart animation) can usefully perceive, and will finish a 60-second clip in a few seconds. Tune the pacing sleep so the *demo* feels like it's watching something happen in real time.
---

# Phase 5: Command Dashboard & 3D Digital Twin Frontend

## Goal
Build the control-room web application that authorities use to monitor the event live: a 2D venue map with a real-time density/risk heatmap, trend analytics charts, an AI intervention panel showing recommendations with one-click actions, a voice assistant trigger, external-trigger simulation buttons, and a 3D digital twin rendering the same risk data spatially.

This corresponds to **Features.md → Section 4: Command Dashboard** (in full) and **Section 6 Bonus Features → Digital Twin, AI Simulation, Voice Command Center (UI trigger)**, plus **Nice-to-Have → Visual Alert System Integration** (the UI trigger side).

## Prerequisites
- Phase 4 backend deployed and reachable (locally at minimum; Render/Railway URL for later integration testing)
- Backend WebSocket `/ws/live` confirmed working via a manual test client (e.g. a simple `wscat` or browser console test) before starting frontend work

---

## Sub-steps

### Step 5.1: React + Vite Setup & Real-time Connectivity

Standard Vite + React project, with a WebSocket hook (`useLiveData`) that connects to the backend, maintains the latest combined frame in state, and exposes it to all components — this is the backbone every other dashboard feature reads from.

### Step 5.2: 2D Live Event Map & Heatmap

Leaflet renders the venue as a base map/image overlay; zone boundaries are drawn as polygons (converted from each zone's `bounds_normalized` into map coordinates); Leaflet.heat renders a heatmap layer weighted by each zone's live `density_score` (or `risk_score`, toggleable), updating as new WebSocket frames arrive.

**Important scoping note:** since this is an indoor/outdoor event venue (not a geographic map in the traditional sense), use Leaflet's `CRS.Simple` coordinate system with a custom image overlay of the venue floor plan, rather than a real-world lat/lng basemap — this is a common and correct Leaflet pattern for indoor venue mapping and keeps zone coordinate math consistent with the `bounds_normalized` (0–1) system already used in Phases 1–2.

### Step 5.3: Analytics, Recommendations, & External Triggers

- Recharts line/area charts plotting live + historical density and risk trends per zone (backed by `/api/trends/{zone_id}`)
- AI Intervention Panel: renders `recommendations` from alert broadcasts, each as a card with a "Broadcast Announcement" one-click button wired to `/api/announcements`
- Voice Assistant trigger button: records browser microphone audio, uploads to `/api/voice-command`, displays the matched intent and executes it client-side (e.g. `navigate_to_zone` pans the map)
- Visual Alert System trigger: a button per zone to simulate pushing an alert to venue signage, wired to `/api/webhooks/signage`

### Step 5.4: 3D Digital Twin & AI Simulation View

A simplified 3D venue built with Three.js/react-three-fiber: zones rendered as flat colored planes (or extruded boxes) positioned according to their normalized bounds, color-mapped to risk score (green→yellow→orange→red), updating live from the same WebSocket data. A separate "Simulation Mode" toggle lets the operator scrub through the Phase 2 `panic_propagation.simulated_steps` or a `/api/simulations/pre-event` result as an animated timeline, rendered on the same 3D model.

---

## Vibe Coding Prompt — Phase 5a: Project Setup & Live Data Layer

```
I'm building the command dashboard for CrowdShield, a hackathon crowd-safety
project. Work inside dashboard/. Set up a React + Vite project (JavaScript
or TypeScript — use TypeScript for better safety given the complex data
shapes involved) with these dependencies: leaflet, leaflet.heat,
react-leaflet, recharts, three, @react-three/fiber, @react-three/drei,
axios, zustand (for global state).

The backend exposes:
- WebSocket at ws://localhost:8000/ws/live (env-configurable via
  VITE_BACKEND_WS_URL) streaming JSON messages shaped like:
  {
    "timestamp": ..., "type": "frame_update" | "alert" | "weather_alert",
    "cv_data": { "zones": [{"zone_id":..., "bounds_normalized":{...},
      "crowd_count":..., "density_score":..., "avg_flow_speed":...,
      "avg_flow_direction_deg":..., "avg_flow_direction_label":...,
      "reverse_flow_detected":..., "bottleneck_detected":...,
      "anomaly_flags":[...]}], "frame_totals": {...} },
    "risk_data": { "zones": [{"zone_id":..., "risk_score":...,
      "risk_level":..., "contributing_factors":{...}}],
      "predicted_crush_timeline": [...] },
    "alert": { "zone_id":..., "recommendations":[...] } // only present
      when type is "alert"
  }
- REST base URL http://localhost:8000/api (env-configurable via
  VITE_BACKEND_HTTP_URL) with endpoints: GET /zones, GET
  /trends/{zone_id}, POST /announcements, POST /voice-command, POST
  /webhooks/signage, POST /simulations/pre-event, GET /sentiment, POST
  /incidents.

Build:

1. src/store/liveDataStore.ts — a zustand store holding: latestFrame
   (the most recent combined WebSocket message), zoneHistory (a Map of
   zone_id -> array of recent {timestamp, density_score, risk_score}
   points, capped at last 100 for in-memory sparkline rendering without
   hitting the API), activeAlerts (array), connectionStatus
   ('connecting'|'connected'|'disconnected'|'error').

2. src/hooks/useLiveWebSocket.ts — a hook that:
   - Opens the WebSocket connection on mount, updates connectionStatus.
   - On each message, parses JSON and updates liveDataStore's
     latestFrame, appends to zoneHistory per zone, and if type ===
     "alert" pushes to activeAlerts (avoiding duplicates by zone_id — an
     alert already in activeAlerts for that zone_id should be replaced/
     updated, not duplicated).
   - Implements auto-reconnect with exponential backoff (starting at 1s,
     max 10s) if the connection drops — critical for demo resilience if
     WiFi hiccups mid-pitch.
   - Cleans up the socket on unmount.

3. src/api/client.ts — an axios instance configured with the base URL
   from VITE_BACKEND_HTTP_URL, and typed wrapper functions for every REST
   endpoint listed above (getZones, getTrends(zoneId), postAnnouncement,
   postVoiceCommand(audioBlob), postSignageWebhook, postPreEventSimulation,
   getSentiment, postIncident).

4. src/App.tsx — a basic layout shell with a top nav bar showing
   connectionStatus as a colored indicator dot (green=connected,
   yellow=connecting, red=disconnected/error) and placeholder sections
   for: Live Map, Analytics, AI Interventions, 3D Digital Twin (we'll
   fill these in the next prompts). Use a clean dark "control room"
   aesthetic (dark background, high-contrast risk colors) appropriate
   for a security operations dashboard — NOT a generic light SaaS
   template look.

Do not build the map, charts, or 3D view yet — this prompt is just the
data layer and app shell.
```

## Vibe Coding Prompt — Phase 5b: 2D Live Map & Heatmap

```
Continue the CrowdShield dashboard in dashboard/. The zustand liveDataStore
and useLiveWebSocket hook from the previous step already exist and provide
real-time zone data shaped as described before.

Build src/components/LiveVenueMap.tsx using react-leaflet with
CRS.Simple (NOT a real-world lat/lng map — this is an indoor venue floor
plan, use Leaflet's simple coordinate system):

1. Render a base ImageOverlay using a placeholder venue floor-plan image
   (accept a prop for the image URL; for now use a simple placeholder
   rectangle/grid SVG generated inline if no real venue image is
   available — comment clearly that this should be replaced with an
   actual venue floor plan image for the real demo).

2. For each zone in the live data (from liveDataStore, matched against
   zone configs fetched via GET /api/zones on mount), render a Leaflet
   Polygon using the zone's bounds_normalized converted to the map's
   coordinate space (multiply normalized 0-1 coords by the image's pixel
   dimensions, and note Leaflet's CRS.Simple has an inverted Y-axis
   versus typical image coordinates — handle that conversion correctly).

3. Color each zone polygon based on its current risk_level from
   liveDataStore (low=green #22c55e, moderate=yellow #eab308, high=orange
   #f97316, critical=red #ef4444), with a smooth CSS transition on color
   change so risk escalation is visually noticeable, not just a hard cut.

4. On hover/click of a zone polygon, show a popup/tooltip with:
   zone_id, crowd_count, density_score, risk_score, current
   avg_flow_direction_label (rendered as an arrow icon rotated to the
   correct compass bearing), and any active anomaly_flags as small
   warning badges.

5. Integrate leaflet.heat as an additional toggleable layer (a button to
   switch between "Zone View" showing colored polygons, and "Heatmap
   View" showing a continuous density/risk heatmap using leaflet.heat's
   gradient, fed by converting each zone's centroid + density_score into
   a heat point weighted by that score) — provide a small floating
   control panel (top-right of the map) to toggle between the two view
   modes and to toggle whether the heatmap is weighted by density_score
   vs risk_score.

6. Add a small legend (bottom-left) explaining the risk color scale.

Make sure this component gracefully handles the state before any
WebSocket data has arrived yet (show a "waiting for live feed..." overlay
rather than a blank/broken map).
```

## Vibe Coding Prompt — Phase 5c: Analytics, AI Intervention Panel & External Triggers

```
Continue the CrowdShield dashboard in dashboard/. Build these three
components, all reading from the existing zustand liveDataStore and
src/api/client.ts:

1. src/components/AnalyticsPanel.tsx:
   - A zone selector dropdown (populated from GET /api/zones).
   - On selection, fetch historical trend data via GET
     /api/trends/{zone_id} AND merge with the live in-memory
     zoneHistory from the store for the most recent points (so the chart
     is both historically backed and live-updating without needing to
     re-fetch on every WebSocket tick).
   - Render TWO Recharts charts stacked: (a) an AreaChart of
     density_score over time, (b) a LineChart of risk_score over time
     with a horizontal ReferenceLine at 0.75 labeled "Critical Threshold"
     so operators can visually see how close/far a zone is from
     danger.
   - Both charts should auto-scroll/update as new live data points
     arrive (cap displayed points to the most recent ~50 for
     readability).

2. src/components/AIInterventionPanel.tsx:
   - Subscribes to liveDataStore's activeAlerts.
   - Renders each active alert as a card: zone_id, risk_level badge,
     a list of recommendations (each showing action, category badge,
     urgency badge, and reasoning text).
   - Each recommendation with category "communication" gets a
     "Broadcast This Announcement" button that calls
     api.postAnnouncement({base_message_en: <derive a reasonable alert
     message from the action text>, zone_id}) and shows a loading spinner
     then a success toast with links/players for the returned audio files
     (render an <audio controls> element per language so the operator can
     preview before real broadcast). Also render the returned
     `social_channels` array as small platform-tagged preview cards
     (showing each platform's formatted_text and a "Simulated Post"
     badge) directly beneath the audio players, so the one-click
     broadcast visibly covers BOTH the mobile/PA-system audio channel
     and the social channel in a single action, matching the full
     Communication Triggers feature — label this section clearly
     "(Simulated — no live social account connected)".
   - Include a manual "Log Intervention" quick-action per alert card (a
     simple text input + submit button) for operators to log a
     custom/manual action taken, for completeness of the interventions
     audit trail (calls a POST /api/interventions endpoint — if this
     endpoint doesn't exist yet in the backend, stub the call and note in
     a code comment that it needs a corresponding backend route).
   - If activeAlerts is empty, show a calm "All zones nominal" state
     rather than an empty/broken-looking panel.

3. src/components/ExternalTriggersPanel.tsx:
   - A zone selector + message text input + "Simulate Signage Push"
     button that calls POST /api/webhooks/signage with the selected zone
     and message, showing the simulated response
     (target_signage_ids returned) in a small result card. Add a clear
     UI label "(Simulated — no physical signage connected)" so this is
     never presented as a real hardware integration during the demo.
   - A "Sentiment Monitor" mini-widget that polls GET /api/sentiment
     every 60 seconds and displays aggregated_unrest_score as a small
     gauge/progress bar plus the list of flagged_posts, labeled clearly
     "(Demo: sample social media dataset)".
   - A "Voice Assistant" button that, on click, requests microphone
     access (navigator.mediaDevices.getUserMedia), records a short clip
     (5 seconds or until a second click to stop, using MediaRecorder),
     uploads the resulting audio blob via api.postVoiceCommand, and
     displays the matched_intent result. If matched_intent is
     "navigate_to_zone", emit a custom event or call a passed-in callback
     prop so the parent App can pan/highlight that zone on the
     LiveVenueMap (wire this connection in App.tsx).

Use consistent risk-level color coding (same palette as the map
component) across all three components for visual coherence.
```

## Vibe Coding Prompt — Phase 5d: 3D Digital Twin & Simulation View

```
Continue the CrowdShield dashboard in dashboard/. Build
src/components/DigitalTwin3D.tsx using @react-three/fiber and
@react-three/drei:

1. Set up a basic Three.js Canvas with OrbitControls (so the operator can
   rotate/zoom/pan the venue model), a simple ambient + directional
   light setup, and a ground plane representing the venue floor.

2. For each zone (from the same zone config + live data used in the 2D
   map), render a flat extruded box (using drei's <Box> or a custom mesh)
   positioned and sized according to bounds_normalized (map the 0-1
   normalized coordinates to a 3D world-space grid, e.g. a 20x20 unit
   venue footprint), with height representing... use height as a SECOND
   visual encoding of risk_score (taller = higher risk) IN ADDITION TO
   color (same risk color palette as the 2D map), so risk is
   double-encoded (color + height) for clarity from any camera angle.
   Animate height/color transitions smoothly (react-spring or simple
   lerped useFrame updates) rather than snapping, since visually
   "escalating" risk is more compelling in a live demo than static
   values.

3. Add floating 3D text labels (drei's <Text>) above each zone showing
   zone_id and current risk_score, always facing the camera (billboard
   behavior).

4. Build a "Simulation Mode" toggle (a UI overlay button, not embedded in
   the 3D scene) that, when activated:
   - Shows a secondary control: either "Live Fast-Forward Prediction"
     (uses the most recent predicted_crush_timeline / panic_propagation
     data already arriving via WebSocket in risk_data) OR "Pre-Event
     Stress Test" (opens a small form: entry zone selector, expected
     attendance number input, submit button that calls POST
     /api/simulations/pre-event and stores the returned step-by-step
     simulation).
   - Once simulation data is loaded (either source), renders a
     timeline scrubber (a horizontal slider) below the 3D canvas showing
     step numbers / time offsets. Moving the scrubber updates the 3D
     zone colors/heights to reflect that simulated step's risk scores
     INSTEAD of the live WebSocket data (pause live updates while in
     Simulation Mode, clearly labeled with a banner "SIMULATION MODE —
     not live data" in a distinct color, e.g. purple/blue, to avoid any
     confusion with real live risk during a demo).
   - Include a "Play" button that auto-advances the scrubber through all
     steps at a fixed interval (e.g. 800ms per step) for a hands-free
     animated playback during the pitch.
   - An "Exit Simulation" button returns to live WebSocket-driven
     rendering.

Make sure switching between Simulation Mode and Live Mode is visually
unambiguous — this is one of the most important UX details for a
credible demo, since judges must never mistake a simulated prediction
for an actual live event.
```

---

## Test Cases — Phase 5

| # | Test | Expected Result |
|---|---|---|
| 5.1 | Load the dashboard with the backend NOT running | Connection status shows "disconnected"/red, no crash, UI remains usable |
| 5.2 | Start the backend + processing, then load the dashboard | Connection status turns green within a few seconds; map zones begin updating |
| 5.3 | Kill the backend mid-session, then restart it | Dashboard auto-reconnects within the backoff window without requiring a page refresh |
| 5.4 | Feed a video with one zone reaching "critical" | That zone's polygon on the map turns red with a visible color transition (not instant snap) |
| 5.5 | Toggle Heatmap View | Heatmap renders and updates as live density changes; toggling back to Zone View restores polygon rendering |
| 5.6 | Click/hover a zone polygon | Tooltip shows correct live stats matching the WebSocket payload for that zone |
| 5.7 | Select a zone in Analytics Panel with existing historical data | Both charts render with real data points; risk chart shows the 0.75 threshold reference line |
| 5.8 | Let a zone cross into "high" risk during a live demo run | A new alert card appears in AI Intervention Panel within one broadcast cycle, showing recommendations |
| 5.9 | Click "Broadcast This Announcement" on a recommendation | Audio players appear for all 5 languages after a loading state; playing one produces audible correct-language speech |
| 5.10 | Click "Simulate Signage Push" | Result card appears showing simulated target IDs; response is clearly labeled as simulated |
| 5.11 | Wait 60+ seconds and observe Sentiment Monitor | Gauge/value updates on the next poll cycle without a full page reload |
| 5.12 | Click Voice Assistant, say "show me zone A1" | Correct transcription + intent shown; map pans/highlights zone A1 |
| 5.13 | Click Voice Assistant, say something unrelated | Shows "unrecognized" gracefully, no crash |
| 5.14 | Open 3D Digital Twin view during live processing | Zone boxes render with correct position, color, and height matching current risk scores |
| 5.15 | Enable Simulation Mode → Pre-Event Stress Test with a hypothetical attendance number | Simulation loads; scrubber becomes active; moving it changes 3D zone states; "SIMULATION MODE" banner is clearly visible |
| 5.16 | Click "Play" in Simulation Mode | Scrubber auto-advances through all steps at the fixed interval |
| 5.17 | Click "Exit Simulation" | 3D view returns to live WebSocket-driven data, banner disappears |
| 5.18 | Resize browser window / test on a smaller laptop screen resolution | Layout remains usable (no critical overlapping elements) — verify before demo day on the ACTUAL presentation device |
| 5.19 | Deploy dashboard to Vercel pointing at the deployed Render/Railway backend | Full live flow works end-to-end against production URLs, not just localhost |

## Phase 5 Checklist

- [ ] Vite + React project scaffolded with all required dependencies
- [ ] WebSocket hook connects, updates store, and auto-reconnects on drop
- [ ] REST API client wraps all backend endpoints with correct types
- [ ] Dark control-room visual theme applied consistently (not default template look)
- [ ] 2D Leaflet map uses `CRS.Simple` correctly with proper coordinate conversion
- [ ] Zone polygons color-coded by risk level with smooth transitions
- [ ] Heatmap toggle (leaflet.heat) working and switchable between density/risk weighting
- [ ] Zone hover/click tooltips show correct live stats including flow direction arrow
- [ ] Analytics panel charts combine historical + live data correctly with threshold reference line
- [ ] AI Intervention Panel renders alerts, recommendations, and one-click broadcast correctly
- [ ] Audio players work for all 5 broadcast languages
- [ ] External Triggers panel (signage, sentiment, voice) all functional and clearly labeled where simulated/mocked
- [ ] Voice assistant records, uploads, and correctly triggers map navigation on recognized intent
- [ ] 3D Digital Twin renders zones with correct position/color/height double-encoding
- [ ] Simulation Mode (both live fast-forward and pre-event stress test) works with scrubber + auto-play
- [ ] Simulation Mode is visually unambiguous vs. live mode (banner, color distinction)
- [ ] Dashboard deployed to Vercel and tested against the deployed backend, not just localhost
- [ ] Full demo walkthrough tested on the actual device/screen that will be used for the pitch

## Common Pitfalls

- **Leaflet `CRS.Simple` Y-axis inversion** is the single most common bug in indoor-venue Leaflet builds — normalized `y_min`/`y_max` from Phase 1 assume image-style top-left origin, but Leaflet's simple CRS treats increasing Y as "up," so failing to invert will render zones vertically flipped/mirrored relative to the actual venue image. Test this explicitly (test case 5.4/5.6) by confirming a zone visually known to be at the "top" of the venue image renders at the top of the map, not the bottom.
- **WebSocket message flooding React re-renders**: if every single WebSocket message triggers a full re-render of heavy components (3D scene, all charts), the dashboard can visibly lag during a live demo. Use selective zustand subscriptions (subscribe components only to the specific slice of state they need, e.g. only their zone's data) rather than one giant re-render on every store update.
- **Never let Simulation Mode and Live Mode data blend** — a common bug is leaving the WebSocket handler still updating state while Simulation Mode is active, causing the 3D view to flicker between simulated and live values. Explicitly pause live-state application (not the WebSocket connection itself — keep receiving data in the background, just don't apply it to the rendered view) while Simulation Mode is on.
- **Test on the actual demo hardware/resolution beforehand** — 3D scenes and Leaflet maps can behave differently across GPU/browser combinations; do a full dry run (Phase 7) on the exact laptop and screen resolution you'll present with, not just your primary dev machine.
- **Microphone permissions**: browsers block `getUserMedia` on non-HTTPS origins (except `localhost`) — if demoing from a deployed Vercel URL, confirm it's served over HTTPS (Vercel does this by default) or the Voice Assistant button will silently fail.
---

# Phase 6: Companion Mobile Application (Citizen App)

## Goal
Build the citizen-facing mobile app: a multi-screen React Native (Expo) app that receives geofenced, multilingual push alerts, shows the user's location relative to active risk zones, lets citizens submit incident reports with GPS + photos, and provides vulnerability-aware safe-route navigation away from high-risk zones.

This corresponds to **Features.md → Section 5: Companion Mobile Application** (in full) and **Nice-to-Have → Accessibility and Inclusion → Safe Route for Vulnerable Individuals** and **Geofenced Push Notifications**.

## Prerequisites
- Phase 4 backend deployed and reachable from a mobile device (not just localhost — use the deployed Render/Railway URL, or your machine's LAN IP for local device testing)
- Firebase project created (Phase 0) with Cloud Messaging and a service account configured
- Expo Go app installed on a physical test device (recommended over simulator-only testing for GPS/push notification features, which behave inconsistently in simulators)

---

## Sub-steps

### Step 6.1: React Native (Expo) Base Setup

A clean Expo-managed workflow project (fastest path for a hackathon — avoids native build toolchain setup) with a bottom-tab navigator across the core screens: Home/Alerts, Map & Safe Routes, Report Incident, Settings (language preference).

### Step 6.2: Geofenced Location Warnings & Push Notifications

Firebase Geolocation-style continuous location tracking (via Expo's `expo-location`) compares the user's current GPS position against active high-risk zone boundaries (fetched from the backend, mapped from `bounds_normalized` into approximate real-world coordinates using a venue-to-GPS calibration — see design note below) and triggers **local** warnings immediately on proximity, while Firebase Cloud Messaging delivers **backend-pushed** alerts (for zone-wide or venue-wide broadcasts that don't depend on the exact geofence math, e.g. the multilingual announcements generated in Phase 3).

**Design note — venue GPS calibration:** since Phase 1's zones are defined in normalized image-space coordinates (0–1), and a phone's GPS gives real-world lat/lng, a lightweight calibration step is needed: store 2 reference points (venue's real-world lat/lng for the image's top-left and bottom-right corners) in the zone config, then linearly interpolate any normalized zone boundary into approximate lat/lng. This is an approximation appropriate for demo purposes (it assumes a roughly rectangular, non-rotated venue) — document this clearly rather than over-engineering a full georeferencing system in hackathon time.

### Step 6.3: Two-Way Citizen Incident Reporting & Navigation

An incident report form (GPS auto-tagged, optional photo attachment via camera/gallery, optional text notes) posting to the backend's `/api/incidents` endpoint (which writes to Supabase, visible in real time on the Phase 5 dashboard via Supabase Realtime or the same WebSocket stream). Safe-route navigation uses Leaflet Routing Machine (OSRM) to compute a path from the user's current position to a chosen/nearest safe exit, dynamically weighting the route away from zones currently flagged high/critical risk, with a toggle for accessibility-aware routing profiles.

---

## Vibe Coding Prompt — Phase 6a: Project Setup & Core Navigation

```
I'm building the citizen-facing companion mobile app for CrowdShield, a
hackathon crowd-safety project. Work inside mobile/. Set up an Expo
(React Native, managed workflow, TypeScript) project with these
dependencies: expo-location, expo-notifications, expo-image-picker,
@react-navigation/native, @react-navigation/bottom-tabs,
react-native-maps (or react-native-webview hosting a Leaflet map, since
react-native-maps doesn't support CRS.Simple indoor venue overlays well —
use react-native-webview + a bundled Leaflet HTML page for the venue map,
consistent with the CRS.Simple approach used in the dashboard, Phase 5),
axios, @react-native-async-storage/async-storage (for storing the user's
language preference locally), i18n-js (or a similar lightweight i18n
library) for UI string localization.

The backend exposes (same as Phase 5's dashboard):
- REST base URL (env-configurable, EXPO_PUBLIC_BACKEND_HTTP_URL):
  GET /api/zones, GET /api/routes, GET /api/incidents, POST /api/incidents
- WebSocket (EXPO_PUBLIC_BACKEND_WS_URL): /ws/live, same message shape
  as documented for the dashboard (cv_data, risk_data, alert fields).

Build:

1. A bottom-tab navigator with 4 tabs: "Alerts" (home screen), "Safe Map"
   (venue map + navigation), "Report" (incident submission form),
   "Settings" (language selection + notification preferences).

2. src/store/appStore.ts (use zustand, consistent with the dashboard's
   state approach) holding: userLocation ({lat, lng} | null),
   activeZoneRisks (latest risk_data.zones from WebSocket),
   selectedLanguage (default 'en', persisted via AsyncStorage),
   activeAlerts (array of alert payloads received).

3. src/hooks/useLiveWebSocket.ts — same pattern as the dashboard's hook:
   connects, updates appStore on message, auto-reconnects with backoff.
   Mobile network conditions are LESS reliable than a demo laptop's WiFi,
   so make the backoff more forgiving (retry indefinitely, cap backoff at
   15s) and expose a connectionStatus so the UI can show a
   "reconnecting..." banner rather than silently failing.

4. src/i18n/translations.ts — a translations object covering these UI
   strings in English, Hindi, Tamil, Telugu, Bengali, and Marathi (the
   same 5 languages as the Phase 3 backend's multilingual announcements,
   for consistency): "Alerts", "Safe Map", "Report Incident", "Settings",
   "No active alerts", "You are near a high-risk zone", "Submit Report",
   "Take Photo", "Choose from Gallery", "Notes", "Submit",
   "Wheelchair Accessible Route", "Avoid Stairs", "Language". Wire up
   i18n-js (or chosen library) to switch based on appStore's
   selectedLanguage.

5. Basic screen shells for all 4 tabs (Alerts, Safe Map, Report,
   Settings) with placeholder content — we'll build out Alerts + Safe
   Map + Report in detail in the next prompts. Settings should be fully
   functional now: a simple list of language options that updates
   appStore.selectedLanguage and persists to AsyncStorage.

Use a clean, high-contrast, accessible mobile UI (large tap targets,
readable font sizes) appropriate for a public safety app used possibly
in stressful conditions — not a dense information-heavy layout.
```

## Vibe Coding Prompt — Phase 6b: Alerts Screen, Geofencing & Push Notifications

```
Continue the CrowdShield mobile app in mobile/. The appStore, useLiveWebSocket
hook, and i18n setup from the previous step already exist.

Build:

1. src/screens/AlertsScreen.tsx:
   - Displays activeAlerts from appStore as a scrollable list of cards
     (most recent first), each showing: zone name/id, risk_level badge
     (color-coded consistent with the dashboard's palette: green/yellow/
     orange/red), a translated summary message (use the
     selectedLanguage-appropriate translation if the alert payload
     includes a translations object from the Phase 3 multilingual
     pipeline; otherwise fall back to English), and a timestamp
     ("3 minutes ago" style relative formatting).
   - If activeAlerts is empty, shows a calm "No active alerts" state
     (translated) with a reassuring icon, not a blank/broken-looking
     screen.
   - Pull-to-refresh re-fetches GET /api/zones to confirm the connection
     is alive.

2. src/services/geofencing.ts:
   - A function `startLocationTracking(onLocationUpdate: (loc) => void)`
     using expo-location's watchPositionAsync (accuracy: Balanced,
     distanceInterval: 10 meters) requesting foreground location
     permission first (handle permission-denied gracefully with a clear
     explanatory UI message, don't just silently fail).
   - A function `checkGeofenceProximity(userLocation, zones: Zone[],
     venueCalibration: {topLeftLatLng, bottomRightLatLng}) ->
     {inDangerZone: boolean, nearestDangerZoneId: string | null,
     distanceMeters: number | null}` that:
     a) Converts each zone's bounds_normalized into approximate real-world
        lat/lng using linear interpolation against venueCalibration
        (document clearly in comments: this assumes a roughly
        rectangular, axis-aligned venue footprint — an approximation
        appropriate for hackathon demo scope, not full geodetic
        projection).
     b) Checks if userLocation falls within any zone currently at
        risk_level "high" or "critical" (cross-reference appStore's
        activeZoneRisks).
     c) If not inside one, computes distance (haversine formula) to the
        nearest high/critical zone's centroid, for a proximity warning
        even before actually entering the zone.
   - Wire this into a background-ish effect (Expo managed workflow
     doesn't support true background location without a dev build — for
     hackathon scope, run this check on a foreground interval, e.g. every
     15 seconds while the app is open, and clearly comment that a
     production version would use expo-task-manager background location
     for out-of-app alerting).

3. src/services/notifications.ts:
   - Sets up expo-notifications: requests notification permission,
     registers for a push token, and (comment clearly) would POST this
     token to a backend endpoint to associate with Firebase Cloud
     Messaging for server-triggered pushes — implement this POST call
     to a `/api/devices/register` endpoint (note in a comment that this
     endpoint needs to be added to the Phase 4 backend if not already
     present: it should store {push_token, last_known_location} for
     later FCM targeting).
   - A function `showLocalNotification(title, body)` for IMMEDIATE local
     alerts triggered by the geofencing check in-app (distinct from
     backend-pushed FCM notifications, which arrive independently even
     when the app is backgrounded).
   - Wire the geofencing service's `inDangerZone` result to trigger a
     local notification via showLocalNotification when the user's status
     transitions from safe to in-danger-zone (not repeatedly every 15
     second check while still inside the same zone — track previous
     state to detect the transition only).

4. Update AlertsScreen to show a persistent small banner at the top when
   checkGeofenceProximity reports the user is currently inside or very
   near (<50m) a high-risk zone, with a translated message like "You are
   near a high-risk zone. Consider moving to a safer area." and a button
   "Show Safe Route" that navigates to the Safe Map tab.
```

## Vibe Coding Prompt — Phase 6c: Safe Map, Routing & Incident Reporting

```
Continue the CrowdShield mobile app in mobile/. Build:

1. src/screens/SafeMapScreen.tsx using react-native-webview hosting a
   bundled local HTML file (mobile/assets/map.html) containing a Leaflet
   map (same CRS.Simple + venue image overlay + zone polygon rendering
   approach as the Phase 5 dashboard's LiveVenueMap, reused/adapted for
   consistency), PLUS Leaflet Routing Machine with an OSRM backend for
   route calculation. Communicate between the WebView and React Native
   via postMessage (RN sends: current zone risk data, user's
   approximate position mapped into the venue's normalized coordinate
   space using the same venueCalibration linear-interpolation approach
   as geofencing.ts, and the selected accessibility routing profile;
   WebView sends back: user taps on the map for selecting a destination
   exit).

2. In map.html's Leaflet Routing Machine setup:
   - Show the user's current position as a marker.
   - Show all venue exits as tappable markers (exit locations can be a
     simple hardcoded list for the demo venue, or loaded from an
     extended zone config with an `is_exit: true` flag — prefer the
     latter for consistency with the zones API).
   - On selecting an exit (or auto-selecting the nearest exit by
     default), compute a route using OSRM's public demo server for
     routing logic, BUT since OSRM doesn't natively know about our
     custom risk zones, implement a "risk-weighted routing" workaround:
     generate the route as a series of waypoints that explicitly route
     THROUGH or AROUND zone centroids based on their risk level — a
     practical approach: if the shortest straight-line path would cross
     a zone currently at high/critical risk, insert an intermediate
     waypoint routing around that zone's polygon boundary before
     calling Routing Machine, rather than expecting OSRM itself to
     understand real-time risk weighting (document this clearly as the
     chosen practical approach, since OSRM's road-network routing
     wasn't designed for indoor venue risk-avoidance and a full custom
     routing engine is out of scope for hackathon time).
   - BEFORE falling back to the local "route around this zone's polygon"
     workaround above, first check the backend's GET /api/routes
     response (fetched from React Native and passed into the WebView
     alongside the live zone risk data). This endpoint returns Phase 2's
     `route_blockage_predictions` — precomputed routes with an
     `at_risk_of_blockage` flag that already accounts for EVERY zone
     along a path, not just the zone the straight-line route happens to
     cross, and distinguishes a zone that's currently dangerous from one
     that's only *predicted* to become dangerous soon. Prefer selecting
     an exit whose associated route_id has `at_risk_of_blockage: false`
     when one exists; if the nearest exit's route IS flagged at-risk,
     visibly warn the user (a small banner: "Nearest exit route may be
     blocked near {blocking_zone_id} — rerouting") before falling back
     to the next-nearest exit or the local waypoint-avoidance workaround
     if no clean route exists. This is what makes the mobile app's
     routing risk-AWARE OF THE FULL PATH, not just of the zone the user
     is currently standing in.
   - Render the computed route as a highlighted polyline, color-coded to
     indicate it's a "safe" route (e.g. blue, distinct from the red/
     orange/yellow zone risk colors so it doesn't visually blend in).

3. Add an accessibility routing toggle in SafeMapScreen (outside the
   WebView, as native RN UI): "Standard Route" vs "Wheelchair Accessible
   / Avoid Stairs" — when the accessible profile is selected, pass a flag
   into the WebView's route calculation that additionally avoids any
   zones/waypoints tagged with a `has_stairs: true` property in the
   extended zone config (add this optional field to the zone schema;
   note in a comment that real venue zone configs would need this
   manually tagged during venue setup), in addition to avoiding
   high-risk zones.

4. src/screens/ReportScreen.tsx:
   - A form with: auto-captured GPS coordinates (shown to the user,
     read-only, from expo-location's current position), a photo
     attachment section (buttons for "Take Photo" via expo-image-picker's
     camera launcher, and "Choose from Gallery"), a multi-line text notes
     field, and a "Submit Report" button.
   - On submit: if a photo was attached, note in a comment that in a
     production build this would upload to Supabase Storage first and
     attach the resulting URL — for hackathon scope, either implement a
     real Supabase Storage upload (preferred if time allows: add a
     `uploadPhotoToSupabase(uri) -> url` helper using the supabase-js
     client) or, if simplifying, submit without the photo URL populated
     and clearly comment this as a known simplification.
   - POSTs to /api/incidents with {source: "citizen", gps_coordinates,
     photo_url (if available), notes}.
   - Shows a clear success confirmation (translated) and clears the form,
     or a clear error state with a retry option if the submission fails
     (mobile networks are unreliable — never let a failed submission
     silently disappear without user feedback).

5. Add a small "My Reports" section at the bottom of ReportScreen showing
   the citizen's own previously submitted reports (fetched via GET
   /api/incidents, filtered client-side or via a query param if the
   backend supports filtering by a device/session identifier — note
   in a comment if this requires a minor backend addition for
   per-device filtering, since Phase 4 didn't originally scope
   per-citizen tracking).

Test the full loop: submitting a report from the mobile app should
appear on the Phase 5 dashboard (or at minimum be queryable via GET
/api/incidents) within a few seconds, confirming true two-way
communication between the citizen app and the command dashboard.
```

---

## Test Cases — Phase 6

| # | Test | Expected Result |
|---|---|---|
| 6.1 | Launch the app fresh with no backend running | Shows a clear disconnected/reconnecting state per screen, no crash |
| 6.2 | Launch with backend running, WebSocket live | AlertsScreen shows "No active alerts" calmly when nothing is active |
| 6.3 | Trigger a critical risk zone via the CV pipeline (same video feed as dashboard testing) | A new alert appears in AlertsScreen within a few seconds of the dashboard showing it |
| 6.4 | Change language in Settings to Hindi | All static UI strings update immediately; persists after app restart (AsyncStorage) |
| 6.5 | Grant location permission, physically move the test device (or mock GPS) into a zone flagged high/critical | Local notification fires once on entering the zone, not repeatedly every 15s while still inside |
| 6.6 | Deny location permission | App shows a clear explanatory message, doesn't crash, other features remain usable |
| 6.7 | Open Safe Map with an active high-risk zone present | Route calculation visibly routes around that zone's polygon rather than straight through it |
| 6.7b | Open Safe Map where the nearest exit's route has a MIDDLE zone (not adjacent to the user) flagged `at_risk_of_blockage: true` via GET /api/routes | App selects an alternate exit or shows the "may be blocked" warning banner, rather than routing the user down a path that looks clear nearby but is blocked further along |
| 6.8 | Toggle "Wheelchair Accessible" routing with a zone tagged `has_stairs: true` in the path | Route avoids that zone; toggling back to Standard may use the more direct path |
| 6.9 | Submit an incident report with GPS + notes only (no photo) | Report appears in Supabase `incident_reports` and is visible via GET /api/incidents within a few seconds |
| 6.10 | Submit an incident report with a photo attached | Photo uploads successfully (if Supabase Storage implemented) and `photo_url` is populated in the resulting record |
| 6.11 | Submit a report with the network disabled (airplane mode) | Clear error state shown with a retry option, no silent failure |
| 6.12 | Check "My Reports" section after submitting 2–3 reports | Shows the citizen's own submitted reports |
| 6.13 | Cross-check: submit a report on mobile, then check the Phase 5 dashboard's incident view (or Supabase table directly) | The same report is visible, confirming end-to-end two-way communication |
| 6.14 | Test on a physical device via Expo Go (not just simulator) | GPS, camera, and push notification permissions behave correctly (simulators often mock or skip these) |

## Phase 6 Checklist

- [ ] Expo project scaffolded with all required dependencies, 4-tab navigation working
- [ ] WebSocket hook connects and updates state with mobile-appropriate reconnect tolerance
- [ ] i18n covers all 5 target languages consistently with the Phase 3 backend's language set
- [ ] Language preference persists across app restarts
- [ ] Alerts screen correctly displays active alerts and calm empty state
- [ ] Geofencing correctly calibrates normalized zone bounds into approximate real-world coordinates
- [ ] Location permission handling is graceful (denied state doesn't break the app)
- [ ] Local notifications fire on zone-entry transition only, not repeatedly
- [ ] Push notification token registration flow implemented (even if full FCM server-push wiring is noted as a stretch item)
- [ ] Safe Map renders venue + zones consistently with the dashboard's visual language
- [ ] Risk-aware routing visibly avoids high/critical zones
- [ ] Safe Map consults GET /api/routes (Phase 2's route_blockage_predictions) before falling back to local waypoint-avoidance, so routing accounts for every zone along the path, not just the zone nearest the user
- [ ] Accessibility routing profile (avoid stairs) implemented and testable
- [ ] Incident report form captures GPS, optional photo, and notes correctly
- [ ] Report submission has clear success/error/retry states
- [ ] "My Reports" view confirms citizen-side visibility of their own submissions
- [ ] End-to-end two-way sync confirmed: mobile submission visible on dashboard/backend
- [ ] Tested on a real physical device via Expo Go, not simulator-only

## Common Pitfalls

- **Expo managed workflow can't do true background location tracking** without ejecting to a dev build (`expo-task-manager` background location requires additional native config) — for hackathon scope, foreground-interval checking (documented in the prompt above) is the pragmatic choice; be ready to explain this tradeoff honestly in the pitch rather than overclaiming "background geofencing."
- **GPS accuracy indoors is poor** — real GPS often has 10–50m error indoors/near large structures, which matters a lot for a venue-scale geofence. For the demo, either use an outdoor test area, mock location via Expo's location simulation tools, or clearly caveat this limitation live.
- **`react-native-maps` vs. WebView+Leaflet**: don't try to force `react-native-maps` (Google/Apple Maps-based) to render `CRS.Simple` indoor venue overlays — it's built for real-world geographic maps and fighting it wastes hackathon time. The WebView+Leaflet approach specified above reuses the same mental model (and possibly literal code) as the Phase 5 dashboard.
- **OSRM public demo server rate limits and coverage**: the public OSRM demo server is for light testing only and may not have road-network data appropriate for an indoor venue at all (it's designed for real street routing) — the "insert waypoints around risk zones" approach in the prompt is a practical workaround, not a perfect routing engine; set expectations accordingly for the demo script (Phase 7) and pick a walkthrough path that showcases the risk-avoidance behavior clearly rather than relying on OSRM's street-routing accuracy.
- **Photo uploads eating demo time**: large photo uploads over conference WiFi can be slow; consider client-side image compression (`expo-image-picker`'s quality option) before upload to keep the report submission flow snappy during a live demo.
---

# Phase 7: System Integration & Hackathon Pitch Demo Setup

## Goal
Wire everything built in Phases 1–6 into one reliable, rehearsed, end-to-end demo flow using your hand-picked stampede/crowd videos, with a mock social dataset pre-loaded, and a fully dry-run tested sequence from video feed to mobile push notification — so the live pitch has zero surprises.

This phase directly implements **Build_Order.md → Phase 7** in full, and is where **Phase 8 (Fine-Tuning, below)** must have already been completed for your specific demo videos before you do the final dry runs here.

## Prerequisites
- Phases 1–6 all individually tested and passing their respective test cases
- Your hand-picked demo videos selected, downloaded, and placed in `demo/videos/`
- **Phase 8 fine-tuning already performed on these exact videos** (see the Fine-Tuning appendix later in this guide) — do not attempt Phase 7 integration testing with un-tuned zone configs/thresholds, since generic defaults are unlikely to look convincing on your specific footage

---

## Sub-steps

### Step 7.1: Pre-Recorded Video / Stream Processing

Select/prepare 2–3 clips representing: (a) normal/calm crowd flow, (b) a growing bottleneck, (c) a panic/escalation moment. These become the literal video files fed into `CVPipeline.process_video()` live during the pitch, standing in for a real camera feed (this is explicitly the correct approach per Build_Order.md — using pre-recorded clips avoids depending on unpredictable live camera conditions during a timed pitch slot).

### Step 7.2: Mock Dataset Integration

Confirm the Phase 3 `generate_mock_social_posts()` dataset is loaded and its sentiment scores are pre-validated to look sensible (not needing a live LLM call mid-demo if network is unreliable — consider pre-computing and caching the sentiment result as a fallback).

### Step 7.3: Dry-Run End-to-End Flow

The full validation loop specified in Build_Order.md:
**Trigger surge via video feed → verify Phase 1 CV detection → confirm Phase 2 risk update → trigger Phase 3 AI recommendation & multilingual speech → view alert on Dashboard (Phase 5) → receive FCM push on Mobile App (Phase 6).**

---

## Vibe Coding Prompt — Phase 7a: Demo Orchestration Script

```
I'm preparing the final integration demo for CrowdShield, a hackathon
crowd-safety project. All individual phases (CV pipeline, risk engine,
genai pipeline, FastAPI backend, React dashboard, Expo mobile app) are
already built and individually tested. Work inside demo/.

Build:

1. demo/scripts/demo_runner.py — a single orchestration script that:
   - Takes a --scenario argument (calm | bottleneck | panic | full_sequence)
     mapping to specific video files in demo/videos/.
   - For "full_sequence", runs all 3 scenario videos back-to-back with a
     short pause between each, printing a clear console banner
     announcing which scenario is starting/ending (useful for the
     presenter to narrate along live).
   - Calls the backend's POST /api/processing/start with the selected
     video source and the FINE-TUNED zone config for that specific video
     (load from demo/mock_data/zone_configs/{scenario}.json — these
     configs are the output of Phase 8 fine-tuning, one per demo video).
   - Polls GET /api/processing/status every 2 seconds and prints a
     live-updating console summary (frames processed, current max risk
     score seen, any active alerts) so the presenter has a terminal-based
     safety net view even if the dashboard projector has issues.
   - On completion (or on a Ctrl+C interrupt), calls POST
     /api/processing/stop cleanly.

2. demo/scripts/preflight_check.py — a pre-demo health check script that,
   when run, verifies (printing a clear PASS/FAIL checklist to console):
   - Backend is reachable (HTTP GET to a /health endpoint — add this
     simple endpoint to backend/app/main.py if it doesn't already exist:
     returns {"status": "ok", "timestamp": ...}).
   - WebSocket /ws/live is connectable.
   - Supabase is reachable (a lightweight query, e.g. count rows in
     `zones`).
   - Gemini API key is valid (a minimal test call).
   - Each demo video file in demo/videos/ exists and is readable
     (cv2.VideoCapture opens successfully, reports correct duration).
   - Each fine-tuned zone config JSON in demo/mock_data/zone_configs/
     parses correctly and its zone_ids match what the corresponding
     video's expected zone layout should be.
   - Dashboard is reachable at its deployed URL (or localhost, configurable)
     via a simple HTTP GET.
   - Mobile backend URL is reachable from the same network the demo
     phone will use (prompt for a manual confirmation step here, since
     this can't be fully automated — print a reminder to test this on
     the actual phone before going on stage).
   Print a final summary: "X/Y checks passed" and exit with a non-zero
   code if any check failed, so this can be run as a literal final gate
   ~15 minutes before the pitch slot.

3. demo/mock_data/social_posts_cache.json — pre-run the Phase 3
   sentiment analysis pipeline (generate_mock_social_posts +
   analyze_posts) ONCE offline, and save the resulting output JSON here.
   Add a fallback in the backend's GET /api/sentiment route (if not
   already present) that, on any LLM call failure/timeout, returns this
   cached file's contents instead of erroring — so a live network hiccup
   during the pitch never breaks the sentiment widget.

4. demo/mock_data/announcement_audio_cache/ — pre-generate the
   multilingual TTS audio files for the 2-3 most likely demo alert
   messages (e.g. "Please move calmly toward the nearest exit, avoid the
   main stage area" and similar) across all 5 languages, using the Phase
   3 MultilingualAnnouncer offline ahead of time, and cache them here.
   Add the same fallback pattern to POST /api/announcements: if live
   translation/TTS generation fails or is slow (set a reasonable timeout,
   e.g. 8 seconds), fall back to the closest pre-cached message rather
   than leaving the operator staring at a spinner during the pitch.

5. demo/README.md — a literal run-of-show document (not code) listing:
   - Exact command sequence to start backend, dashboard, and have the
     mobile app connected, in order, with expected startup time for each.
   - The demo_runner.py commands for each scenario.
   - A "if X breaks, do Y" troubleshooting quick-reference (e.g. "if
     WebSocket won't connect, refresh dashboard tab", "if voice command
     fails, fall back to typing the zone name in a text query field" —
     note: only include this fallback if a text-query alternative
     actually exists; otherwise note it as a known live-demo risk to
     avoid on stage).
```

---

## Test Cases — Phase 7

| # | Test | Expected Result |
|---|---|---|
| 7.1 | Run `preflight_check.py` with everything correctly configured | Reports "Y/Y checks passed", exits 0 |
| 7.2 | Run `preflight_check.py` with the backend intentionally stopped | Correctly reports the backend check as FAILED, exits non-zero |
| 7.3 | Run `demo_runner.py --scenario calm` | Video processes; dashboard shows low/moderate risk throughout, no false alerts fire |
| 7.4 | Run `demo_runner.py --scenario bottleneck` | Dashboard visibly shows a zone's risk climbing into "high", an AI recommendation appears |
| 7.5 | Run `demo_runner.py --scenario panic` | Dashboard shows rapid escalation to "critical" in at least one zone; alert + recommendations + multilingual announcement all trigger; mobile app receives the alert |
| 7.6 | Run `demo_runner.py --scenario full_sequence` uninterrupted | All 3 scenarios play back-to-back with correct console narration banners, no manual intervention required between them |
| 7.7 | Disconnect network briefly during a `panic` scenario run (simulate WiFi hiccup) | Sentiment widget and announcement generation fall back to cached data rather than hanging/erroring visibly |
| 7.8 | Time a full `full_sequence` run end-to-end | Confirm total runtime fits comfortably within your actual pitch time slot (with margin for live narration) |
| 7.9 | Have a team member unfamiliar with the code run `preflight_check.py` + `demo_runner.py --scenario panic` from `demo/README.md` alone | They can execute the full demo successfully using only the README instructions — confirms the run-of-show is actually clear, not just clear to the original builder |
| 7.10 | Full dry run on the EXACT physical setup (laptop, projector/HDMI, WiFi network, phone) intended for the real pitch | Everything works identically to local dev testing — surfaces any environment-specific issues (resolution scaling, WiFi captive portals, projector color rendering) before it's too late to fix |

## Phase 7 Checklist

- [ ] 2–3 demo videos selected representing calm / bottleneck / panic scenarios
- [ ] **Phase 8 fine-tuning completed for all demo videos before this phase's dry runs**
- [ ] `demo_runner.py` correctly orchestrates each scenario and the full sequence
- [ ] `preflight_check.py` correctly validates every system dependency
- [ ] Sentiment analysis has a cached fallback for network failure
- [ ] Multilingual announcement audio has pre-cached fallback for the most likely demo messages
- [ ] `demo/README.md` run-of-show is clear enough for someone else to execute independently
- [ ] Full end-to-end flow (video → CV → risk → GenAI → dashboard → mobile push) verified working at least 3 times consecutively without failure
- [ ] Timing confirmed to fit the actual pitch slot with narration margin
- [ ] Full dry run completed on the exact physical hardware/network/venue setup for the real pitch
- [ ] A designated fallback plan exists for at least the highest-risk failure points (network dependency, microphone/voice command, projector display) — see Common Pitfalls
- [ ] Backup: a short screen-recording of a fully successful demo run exists as an absolute last-resort fallback if live systems fail entirely on stage

## Common Pitfalls

- **The #1 hackathon demo failure is venue WiFi**, not your code. Test on a hotspot/cellular connection as a backup plan, and know in advance which features degrade gracefully (cached sentiment/audio) vs. hard-fail (live LLM calls, live Supabase writes) if the network is bad — and have a plan for the latter (e.g. "if live processing won't start, fall back to replaying a pre-recorded screen capture while narrating live").
- **Cold-start backend hosting**: as noted in Phase 4, wake up your Render/Railway backend 5–10 minutes before going on stage — a 30-second hang at the start of a timed pitch is costly.
- **Don't demo features you haven't dry-run at least 3 times.** A feature that "worked once" during development is not demo-ready; flaky features (voice recognition misfires, GPS indoors) should either be hardened, given a manual fallback path, or explicitly left out of the live demo and shown only as a recorded clip/screenshot with an honest caveat.
- **Order your scenario narrative for maximum impact**: calm → bottleneck → panic is the natural escalation, but also plan your *narration* to explicitly call out what judges should be watching for at each stage (e.g. "watch the top-left zone — density is climbing, and you'll see the AI flag flow convergence before the count itself looks alarming") since judges won't automatically know what to look for in a live dashboard.
- **Always have an offline recorded backup.** If live systems fail completely on stage (venue network outage, hardware failure), a 90-second screen recording of a previously successful full run is the single highest-value insurance policy for a hackathon pitch — prepare this even if you're confident, and never skip it as "we won't need it."
---

# Phase 8 (Appendix): Fine-Tuning the Models for Your Hand-Picked Demo Videos

## Why This Phase Exists

You will demo with **specific, hand-picked stampede/crowd videos**, not arbitrary live camera footage. That is a huge advantage — it means you don't need a generically robust model, you need a model and a config that performs **flawlessly on your exact clips**. This phase is about exploiting that advantage deliberately, rather than hoping generic defaults happen to look good.

This phase should be run **after Phase 1 is built and working**, and revisited/finalized **before Phase 7's dry runs** — the recommended point to insert it is right after you've selected your final demo videos and before you lock in the demo run-of-show. Nothing here changes the *code* built in Phases 1–3; it changes the **configuration, calibration, and (optionally) model weights** used specifically for your demo footage.

**Two tracks are covered below, in order of recommended effort:**
1. **Track A — Zero/low-training calibration** (config tuning only, no model retraining, always do this first — highest ROI for lowest effort/risk in hackathon time)
2. **Track B — Actual fine-tuning** (retraining YOLO on your specific footage, only pursue if Track A isn't sufficient and you have time budget left)

---

## Track A: Zero-Training Calibration (Do This First, Always)

### A.1 — Zone Layout Calibration Per Video

Every demo video has a different camera angle, crowd area, and layout. A generic 3×3 grid will often split your video's actual "danger area" awkwardly across multiple zones (diluting the density signal) or lump a calm area and a dangerous area into the same zone (masking the signal).

**Procedure:**
1. Extract a representative frame from each demo video (`ffmpeg -i video.mp4 -ss 00:00:10 -vframes 1 frame.png` or the Colab notebook's frame-extraction cell from Phase 1).
2. Visually identify the actual bottleneck/danger area in the frame — where does the crowd crush, converge, or bottleneck happen in this specific footage?
3. Hand-design a **custom zone layout** (not a generic grid) for this video, using `zone_config.py`'s JSON-loading support (built in Phase 1) so zone boundaries tightly bound the real area of interest. A well-placed 4–6 zone custom layout will vastly outperform a generic 9-zone grid for demo clarity.
4. Set each zone's `max_expected_count` based on what you can visually estimate as "packed" for that specific area in that specific video — this directly controls how `density_score` normalizes, and is the single highest-leverage tuning knob for making your panic scenario clip visibly hit "critical" red at the right moment.

### A.2 — Confidence Threshold & Detection Tuning

YOLOv8n's default confidence threshold (usually 0.25) can under- or over-count depending on your footage's resolution, lighting, and camera angle (aerial/CCTV-style crowd footage is a harder detection case than eye-level footage, since heads/bodies are smaller and more occluded).

**Procedure:**
1. Run `CVPipeline` on each demo video with the default threshold, and visually compare bounding-box overlays (using the Colab notebook's overlay cell) against your own manual count on a few sample frames.
2. If systematically **undercounting** (missing real people in dense areas): lower the confidence threshold (try 0.15–0.20) and/or lower the IoU threshold for non-max suppression (helps detect people close together who'd otherwise be merged into one box).
3. If systematically **overcounting** (false positives on background objects/shadows): raise the confidence threshold (try 0.35–0.45).
4. Document the final per-video threshold in that video's zone config JSON as a `detection_confidence` field, and load it in `detector.py`'s YOLO inference call (`model.predict(frame, conf=zone_config.detection_confidence)`).
5. **Aerial/CCTV camera angle tip:** if your demo footage is from a high, angled CCTV-style perspective (common in real stampede footage), consider testing YOLOv8n against people at a **smaller `imgsz`** vs. larger (try `imgsz=960` or `1280` instead of the default 640) — higher input resolution often meaningfully improves small/occluded person detection at minimal extra latency cost, which matters more for demo accuracy than raw speed on pre-recorded clips.

### A.3 — Optical Flow Sensitivity Tuning

Farneback's default parameters may produce flow vectors too noisy (false anomaly triggers on video compression artifacts or camera shake) or too smoothed (missing real bottleneck slowdowns) for your specific footage.

**Procedure:**
1. Run the pipeline on your "calm" demo video first — this should produce **near-zero** `avg_flow_speed` if the crowd is genuinely static, and no false `anomaly_flags`. If you see flicker/noise, increase Farneback's `winsize` parameter (larger window = smoother, less noise-sensitive) and/or add a minimum-speed noise floor (treat any `avg_flow_speed` below a small epsilon, e.g. 0.03, as exactly 0 before it reaches the anomaly detector).
2. Run on your "bottleneck" video — confirm the speed drop is clearly visible in the raw `avg_flow_speed` numbers (print/plot them frame-by-frame) at the moment you know visually the crowd slows down. If the drop is too gradual/subtle to trigger `bottleneck_detected` at a convincing moment, adjust the rolling-window comparison size in `tracker.py`'s bottleneck logic (a shorter window reacts faster/more sharply).
3. Run on your "panic" video — confirm `reverse_flow_detected` and/or `erratic_movement_flag` actually fire during the visible panic moment, not before or after it. Adjust the 135-degree reverse-flow angle threshold and the 40% population-fraction threshold (from Phase 1's `detect_anomalies`) if the specific footage's panic behavior is more subtle or more extreme than these hackathon-default thresholds assume.

### A.4 — Risk Scoring Weight Tuning Per Demo Narrative

Phase 2's risk-scoring weights (`w_density, w_rate, w_convergence, w_bottleneck, w_anomaly`) are global defaults. For your specific 3-video demo narrative, you want the **timing** of when each clip crosses into "moderate" → "high" → "critical" to line up well with your live narration.

**Procedure:**
1. Run the full Phase 1 + Phase 2 pipeline on each demo video **offline** first (batch mode, not live), and plot `risk_score` over time (a simple `matplotlib` line chart is enough) for the highest-risk zone in each video.
2. For the "panic" video specifically: confirm the risk score crosses the `critical` (0.75) threshold at a moment that is visually and narratively convincing — not too early (before anything looks wrong on screen) and not too late (after the crowd has visibly already panicked, making the system look like it's lagging behind reality instead of predicting ahead of it).
3. If the timing is off, the fastest fix is usually NOT reweighting all 5 factors — it's checking which single factor is under-contributing for this specific footage (e.g. if your panic clip has strong reverse-flow but weak density change, `w_anomaly` may need a temporary bump for this demo config) and adjusting weights **per-video** (store as an override in that video's zone config, rather than changing the global defaults used elsewhere) so you don't compromise the general-purpose scoring logic just to fit one clip.
4. Re-run and re-plot after each adjustment. Budget for 3–5 iterations per video — this is genuinely iterative tuning, not a one-shot fix.

### A.5 — Panic Diffusion Rate Tuning

If you're using the Phase 2 panic-diffusion "fast-forward" simulation live during the demo (e.g. showing a predicted spread from the currently-escalating zone into neighbors), tune `diffusion_rate` and `decay_rate` specifically against your chosen video's zone adjacency and crowd distribution, using the same offline-plot-then-adjust procedure as A.4, so the predicted spread animation looks plausible relative to the zone layout you hand-designed in A.1 (e.g. diffusion should visibly reach the "obvious" next-adjacent zone within a believable few simulated steps, not instantly saturate the whole venue or barely move at all).

---

## Track B: Actual Model Fine-Tuning (If Track A Isn't Enough)

Only pursue Track B if, after Track A calibration, YOLOv8n's raw detection accuracy on your specific footage is still visibly unreliable (e.g. consistently missing large, obvious clusters of people, or your footage has an unusual camera angle/lighting condition generic COCO-trained weights handle poorly) **and** you have hackathon time budget remaining. Track A alone is sufficient for the large majority of hackathon demo scenarios and should be your default.

### B.1 — When Fine-Tuning Is Actually Warranted

- Your footage is from an unusual vantage point (e.g. extreme top-down drone/CCTV angle) where COCO's training distribution (mostly eye-level/ground-level photos) genuinely under-represents the visual pattern.
- Your footage has unusual lighting/color conditions (night-vision, heavy motion blur, low resolution upscaled) where general-purpose weights degrade significantly.
- You have already tried A.2's confidence/IoU/imgsz tuning and detection is still visibly wrong in a way that would be obvious to judges.

### B.2 — Data Preparation

1. Extract frames from your demo videos at a reasonable interval (e.g. every 10th frame via `ffmpeg` or OpenCV) — you need enough varied frames to fine-tune on, but for a narrow single-scenario fine-tune, even 100–300 labeled frames can meaningfully help, since you're specializing an already-strong pretrained model to a narrow domain (your specific footage), not training from scratch.
2. Label the extracted frames with bounding boxes around each person. Use a free annotation tool — **[Roboflow](https://roboflow.com)** (has a generous free tier and exports directly to YOLO format) or **[CVAT](https://www.cvat.ai)** (free, open-source, self-hostable or free cloud tier) are both well-suited for a fast hackathon labeling pass. Roboflow is generally faster to get started with for a small team.
3. **Speed up labeling with model-assisted pre-labeling:** run your existing YOLOv8n model on the frames first, export its predictions as a starting-point label set, then have a human quickly correct (add missed detections, remove false positives, adjust box tightness) rather than labeling from scratch — this can cut labeling time by 60–80% for a domain where the base model is already roughly working.
4. Split into train/val sets (a simple 80/20 split is fine for this scale) and export in YOLO format (image + `.txt` label files with normalized bbox coordinates, one class: `person`).

### B.3 — Fine-Tuning Procedure (Ultralytics YOLO)

Run this on Google Colab's free T4 GPU tier (fine-tuning, unlike inference, benefits meaningfully from GPU acceleration and will be painfully slow on CPU):

```python
from ultralytics import YOLO

# Start from the pretrained COCO checkpoint — this is TRANSFER LEARNING,
# not training from scratch. We're specializing, not replacing, the
# existing person-detection knowledge.
model = YOLO("yolov8n.pt")

results = model.train(
    data="crowdshield_demo_dataset/data.yaml",  # Roboflow/CVAT export
    epochs=50,            # small dataset -> fewer epochs needed; watch for
                           # overfitting on val loss and stop earlier if it
                           # plateaus or worsens
    imgsz=960,             # match the imgsz decided in Track A.2 if you
                           # already tuned it
    batch=8,               # adjust down if you hit Colab GPU memory limits
    freeze=10,              # freeze the first 10 layers (the general
                            # low-level visual feature extractors) and only
                            # fine-tune later layers — faster convergence,
                            # lower overfitting risk on a small dataset
    patience=10,            # early stopping if val loss doesn't improve
    project="crowdshield_finetune",
    name="demo_videos_v1"
)
```

**Key fine-tuning principles to follow:**
- **Always fine-tune FROM the pretrained checkpoint**, never from random weights — you have far too little labeled data (hundreds, not thousands+ of images) to train a person detector from scratch; the whole point is leveraging COCO's general person-detection knowledge and only adapting to your footage's specific visual quirks.
- **Freeze early layers** (as shown above) — early conv layers learn generic edge/texture features that transfer well regardless of domain; only later layers need adaptation to your specific footage's person-appearance patterns.
- **Watch for overfitting aggressively** — with a small, narrow dataset (literally your demo clips), it's very easy to overfit to the point where the model performs suspiciously perfectly on your exact training frames but that's a red flag, not a win, if it's because the model memorized specific frames rather than generalizing across the *video* (validate on held-out frames from the SAME video that weren't in the training split, not just any random split, to catch this).
- **Keep the original `yolov8n.pt` weights around unchanged** — always A/B test the fine-tuned model against the original on your validation frames before committing to using it in the demo; a fine-tune that's *worse* than the base model (possible with too few epochs, bad labels, or too aggressive a learning rate) should be discarded, not shipped just because effort was spent on it.

### B.4 — Validating the Fine-Tuned Model

1. Run both the original `yolov8n.pt` and your fine-tuned checkpoint on a **held-out** portion of each demo video (frames NOT used in training) and visually compare bounding box overlays side by side.
2. Compute a simple precision proxy: manually count people in 5–10 held-out frames per video, and compare each model's detected count against your manual ground truth. Prefer whichever model has consistently smaller count error across frames, not just on a single lucky frame.
3. Re-run Track A's calibration steps (A.2's confidence threshold in particular) against the FINE-TUNED model specifically — a fine-tuned model's optimal confidence threshold may differ from the base model's.
4. Swap the fine-tuned weights path into that specific demo video's zone config (`model_weights_path` field), keeping the original `yolov8n.pt` as the default for any non-demo/general use, so you don't accidentally degrade general-purpose behavior outside your specific demo clips.

### B.5 — Fine-Tuning the Risk/Anomaly Thresholds Empirically (Optional Advanced Step)

If you have extensive time budget remaining, you can go one step further than Track A.4's manual weight nudging: treat your hand-labeled ground truth ("this frame is calm", "this frame shows a clear bottleneck", "this frame shows panic" — label a sample of frames from each demo video with a rough ground-truth risk category) as a tiny validation set, and grid-search the Phase 2 risk-scoring weights (`w1..w5`) plus the anomaly thresholds from Phase 1 to find the combination that best separates your labeled calm/bottleneck/panic frames by `risk_score`. This is a nice-to-have refinement, not a required step — Track A's manual iteration (A.4) is sufficient for the large majority of hackathon demo needs, and this step should only be attempted if time remains after everything else in this guide is complete and tested.

---

## Test Cases — Phase 8

| # | Test | Expected Result |
|---|---|---|
| 8.1 | Run the pipeline with the custom per-video zone layout (A.1) vs. the original generic grid | Custom layout produces a visibly cleaner, more interpretable density signal in the actual danger area |
| 8.2 | Manually count people in 5 sample frames per demo video, compare against pipeline output at the tuned confidence threshold | Detected count within a small, consistent margin of manual count (define your own acceptable margin, e.g. ±10%, and confirm it's met) |
| 8.3 | Run pipeline on the "calm" video after optical flow tuning (A.3) | `avg_flow_speed` stays near-zero throughout; zero false `anomaly_flags` |
| 8.4 | Run pipeline on the "bottleneck" video after tuning | `bottleneck_detected: true` fires at the visually correct moment (compare timestamp against your own manual review of the clip) |
| 8.5 | Run pipeline on the "panic" video after tuning | `reverse_flow_detected` and/or `erratic_movement_flag` fire at the visually correct moment, not early/late |
| 8.6 | Plot `risk_score` over time for the "panic" video after weight tuning (A.4) | Crosses the critical threshold at a narratively convincing moment, confirmed by re-watching the clip alongside the plot |
| 8.7 | (If Track B pursued) A/B compare fine-tuned vs. base YOLOv8n on held-out frames | Fine-tuned model shows measurably better (not just anecdotally "seems better") detection accuracy on your specific footage |
| 8.8 | (If Track B pursued) Check fine-tuned model on a frame type NOT resembling training data (e.g. a random stock crowd photo) | Confirm it hasn't catastrophically degraded general person-detection ability (sanity check against overfitting) |
| 8.9 | Re-run full `preflight_check.py` (Phase 7) after all tuning is finalized | All checks still pass; tuned configs are correctly referenced by the demo runner |
| 8.10 | Full run-through of all 3 tuned demo videos back-to-back | Each scenario tells a clear, visually convincing story matching its intended narrative (calm/bottleneck/panic) with no jarring mistimed alerts |

## Phase 8 Checklist

- [ ] Custom zone layout hand-designed for each demo video (not generic grids)
- [ ] `max_expected_count` calibrated per zone per video based on visual inspection
- [ ] Detection confidence/IoU/imgsz tuned per video and documented in that video's config
- [ ] Optical flow noise floor and window size tuned against the "calm" video specifically
- [ ] Bottleneck detection timing validated against the "bottleneck" video
- [ ] Reverse-flow/erratic-movement anomaly timing validated against the "panic" video
- [ ] Risk-scoring weights tuned per-video (with overrides, not global changes) for narrative timing
- [ ] Panic diffusion rate tuned if the fast-forward simulation is used live in the demo
- [ ] (If pursued) Fine-tuning dataset labeled with model-assisted pre-labeling
- [ ] (If pursued) Fine-tuned model trained via transfer learning from `yolov8n.pt`, with frozen early layers
- [ ] (If pursued) Fine-tuned model validated A/B against base model on held-out frames, with a general-purpose sanity check
- [ ] All tuning changes stored as per-video config overrides, not destructive changes to global defaults
- [ ] Final tuned configs re-validated against `preflight_check.py` and the full demo sequence

## Common Pitfalls

- **Don't skip straight to Track B.** Model fine-tuning is the highest-effort, highest-risk (overfitting, wasted time, GPU quota limits on Colab free tier) path — the large majority of "this doesn't look right on our demo video" problems are actually zone-layout, threshold, or weight-tuning problems (Track A), which are faster, safer, and just as effective for a hand-picked-video demo.
- **Tuning to the point of dishonesty**: there's a difference between calibrating thresholds so your real signal is clearly visible (legitimate, standard practice — real production crowd-safety systems are calibrated per-venue too) and rigging the numbers so an unremarkable clip *looks* dramatic. Keep your risk-scoring logic's actual formula and factors unchanged and defensible; only tune the *weights and thresholds*, and be ready to explain your tuning methodology honestly if asked — judges respect "we calibrated density normalization and confidence thresholds against our specific camera footage, here's why" far more than an unexplained black box.
- **Colab free-tier GPU quota limits**: if pursuing Track B, be aware Colab's free T4 access has usage caps that reset periodically — don't leave fine-tuning to the last possible hour before your dry runs in case you hit a quota wall and need to wait or fall back to CPU (much slower) or a different free GPU source.
- **Re-run Track A calibration steps whenever you change footage** — if you swap out a demo video late in the process (e.g. found a better panic clip), do NOT assume the previous video's tuned config transfers; re-run at least A.1 (zone layout) and A.2 (confidence threshold) at minimum, since these are highly footage-specific.
- **Held-out validation matters even in a rushed hackathon timeline** — testing a fine-tuned model only on the frames it was trained on will make it look artificially perfect; always keep some frames aside, per B.3, however small the dataset.
---

# Feature Coverage Matrix

This matrix cross-references **every single feature** listed in `Features.md` against the exact phase and sub-step of this guide that implements it, so you can confirm nothing was dropped during the build.

## Core Mandatory Features (From Problem Statement)

| Feature | Guide Location |
|---|---|
| Density Estimation | Phase 1, Step 1.1 |
| Movement Tracking (speed + flow direction) | Phase 1, Step 1.2 |
| Congestion & Bottleneck Identification | Phase 1, Step 1.3 |
| Anomaly Detection (sudden stops, erratic movement) | Phase 1, Step 1.3 |
| Predictive Analytics (crush/stampede likelihood, surges) | Phase 2, Steps 2.1–2.3 |
| Panic Propagation Tracking | Phase 2, Step 2.2 |
| Flow Disruption (reverse movement, route blockage prediction) | Phase 1 Step 1.3 (reverse-flow detection) + Phase 2 Step 2.1b (`RouteBlockagePredictor` — dedicated route-level blockage prediction, distinct from per-zone reverse-flow) |
| Zone Risk Mapping (dynamic, pre-danger) | Phase 2, Step 2.1 + Phase 5, Step 5.2 (visualization) |
| Flow Management Suggestions (alternate exits, gate closures) | Phase 3, Step 3.1 |
| Resource Allocation Recommendations | Phase 2, Step 2.3 (heuristic engine) + Phase 3, Step 3.1 (LLM reasoning layer) |
| Crowd Control Tactics (barricades, one-way flow) | Phase 3, Step 3.1 (`RecommendationEngine` prompt explicitly surfaces one-way flow when flow convergence dominates) |
| Communication Triggers (multilingual public announcements via mobile AND social channels) | Phase 3, Step 3.2 (translation/TTS) + Phase 3 `format_for_social_channels` (simulated social posting) + Phase 4 `/api/announcements` (logs multi-channel dispatch) + Phase 5/6 (mobile push + broadcast UI) |
| Live Event Map | Phase 5, Step 5.2 |
| Crowd Heat Map | Phase 5, Step 5.2 |
| Trend Analytics (historical + predictive charts) | Phase 5, Step 5.3 |
| Live Alerts (multilingual, location-based) — mobile | Phase 6, Step 6.2 |
| Two-way Communication (incident reports + notifications) — mobile | Phase 6, Step 6.3 |
| Digital Twin (3D venue representation) | Phase 5, Step 5.4 |
| AI Simulation (theoretical crowd movement) | Phase 2, Step 2.3 + Phase 5, Step 5.4 (visualization) |
| Voice Command Center | Phase 3, Step 3.3 + Phase 5, Step 5.3 (UI trigger) |
| Multilingual AI Assistant (query data by voice) | Phase 3, Step 3.3 (intent recognition) + Phase 3 `VoiceQueryResponder` (answers recognized queries against live risk data and speaks the answer back via TTS) + Phase 5 voice trigger UI |
| Generative AI Summaries (post-incident) | Phase 3, Step 3.1 |

## Nice-to-Have Enhancements

| Feature | Guide Location |
|---|---|
| Scenario Stress-Testing (pre-event) | Phase 2, Step 2.3 (`PreEventSimulator`) |
| Resource Allocation Optimization (historical data driven) | Phase 2, Step 2.3 (`ResourceAllocator`) |
| Geofenced Push Notifications | Phase 6, Step 6.2 |
| Weather Integration | Phase 4, Step 4.4 |
| Sentiment Analysis via Social Media (mocked) | Phase 3 (Bonus: Sentiment Analysis sub-step) |
| Safe Route for Vulnerable Individuals | Phase 6, Step 6.3 (accessibility routing profile) + Phase 2 Step 2.1b / `GET /api/routes` (full-path blockage awareness, not just current-zone awareness) |
| Visual Alert System Integration (digital signage) | Phase 4 (`/api/webhooks/signage`) + Phase 5, Step 5.3 (UI trigger) — explicitly simulated, no physical hardware |

## Future Roadmap (Explicitly Descoped, Not Built)

| Feature | Status |
|---|---|
| Offline Mesh Networking (BLE) | Descoped — requires physical devices, out of scope per `Features.md` |
| Automated Drone Routing | Descoped — requires drone hardware/vendor SDKs, out of scope per `Features.md` |
| BLE Geofenced Beacons | Descoped — substituted with GPS-based geofencing (Phase 6, Step 6.2), per `Features.md` |

**Audit conclusion:** every Core Mandatory and Nice-to-Have feature from `Features.md` maps to a specific, testable implementation step in this guide. The three Future Roadmap items are intentionally excluded per the original scoping document itself, and are not silently dropped — they were never in scope for the prototype.

---

# Final Deployment & Wrap-Up Checklist

Use this as the last gate before considering the build "done" and moving fully into demo rehearsal (Phase 7):

## Infrastructure
- [ ] Backend deployed and stable on Render/Railway free tier, with a known cold-start wake-up routine
- [ ] Dashboard deployed to Vercel, tested against the deployed (not just local) backend
- [ ] Supabase project stable, not paused, all 5 tables populated correctly during test runs
- [ ] All API keys (Gemini, Claude, OpenWeatherMap, Firebase) valid and not close to free-tier quota exhaustion on demo day

## AI/ML Core
- [ ] Phase 1 CV pipeline tuned per demo video (Phase 8, Track A minimum)
- [ ] Phase 2 risk engine weights tuned per demo video narrative
- [ ] Phase 3 GenAI pipeline has working fallbacks for every LLM-dependent feature (recommendations, summaries, translations, sentiment)

## Frontend
- [ ] Dashboard fully functional across all 4 sub-panels (map, analytics, AI interventions, external triggers) plus 3D digital twin
- [ ] Mobile app fully functional across all 4 screens (alerts, safe map, report, settings) on a physical test device

## Demo Readiness
- [ ] `preflight_check.py` passes 100% immediately before the pitch slot
- [ ] Full `full_sequence` demo run rehearsed at least 3 times successfully
- [ ] Backup screen recording of a successful full run exists
- [ ] Run-of-show document (`demo/README.md`) is clear enough for a teammate to execute independently
- [ ] Team has assigned roles for the live pitch (who narrates, who operates the dashboard, who handles the phone, who watches for technical issues)
- [ ] Team can articulate, if asked by judges: (1) what's mocked/simulated vs. fully live (sentiment analysis, digital signage) and why, (2) the density normalization approximation and its limitations, (3) the fine-tuning methodology used on the demo footage, (4) what would change to take this from hackathon prototype to production deployment

---

# Closing Notes

This guide sequenced the build **AI-first** deliberately: by the time you reach the backend (Phase 4), you're wiring up real, already-validated data producers rather than guessing at a schema and hoping the AI catches up later. By the time you reach the frontend (Phases 5–6), every visual you build is rendering genuine structured output, not mock data — which is also why the demo (Phase 7) and fine-tuning (Phase 8) phases matter as much as they do: a system that's technically complete but not calibrated to perform well on the specific footage you'll show judges is not yet a finished hackathon project. Treat Phase 8 as seriously as any of the numbered build phases — it is frequently the difference between a demo that merely runs and a demo that visibly, convincingly works.

Good luck with the build and the pitch.
