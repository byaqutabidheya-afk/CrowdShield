# CrowdShield System Documentation

## Overview

CrowdShield is a zone-based crowd-safety early-warning system. It converts video into crowd and movement measurements, converts those measurements into risk scores and forecasts, uses GenAI to produce operator recommendations and public announcements, and distributes the result through the FastAPI backend, WebSockets, the dashboard, the database, and the mobile experience.

The main flow is:

    Video or CCTV
      -> CV pipeline
      -> zone measurements
      -> risk engine
      -> propagation, routes, resources, risk levels
      -> backend orchestration
      -> WebSocket, REST, database, alerts
      -> dashboard, mobile app, announcements

This document describes the logic implemented in the repository. It is a prototype decision-support system; it is not an autonomous emergency-control system.

## 1. Zone model

Source: ai_core/shared/zone_config.py

A venue is divided into zones such as zone_A1 and zone_B2. A Zone contains:

| Field | Meaning |
|---|---|
| zone_id | Stable zone identifier |
| bounds_normalized | x_min, y_min, x_max, y_max values normally between 0 and 1 |
| max_expected_count | Expected maximum count used to normalize density |
| adjacent_zone_ids | Neighboring zones used by convergence and propagation |
| is_exit | Whether the zone represents an exit |

Normalized coordinates make the same map usable for different video resolutions. A detection is assigned by its bounding-box center:

    normalized_x = center_x / frame_width
    normalized_y = center_y / frame_height

A point belongs to a zone when it falls within its normalized bounds. Generated grids use row/column identifiers, for example zone_A1, zone_A2, zone_B1. Default grid adjacency is north, south, east, and west; diagonal adjacency is optional.

## 2. Computer-vision pipeline

Sources:

- ai_core/cv_pipeline/scripts/pipeline.py
- ai_core/cv_pipeline/scripts/detector.py
- ai_core/cv_pipeline/scripts/tracker.py
- ai_core/cv_pipeline/scripts/optical_flow.py

### 2.1 Frame processing

For every video frame, the CVPipeline:

1. Opens the source with OpenCV.
2. Runs YOLO tracking using ByteTrack.
3. Keeps COCO class 0, person.
4. Calculates the center of each person bounding box.
5. Assigns centers to configured zones.
6. Resizes a copy to 640 by 360 for motion analysis.
7. Converts consecutive frames to grayscale.
8. Calculates dense Farneback optical flow.
9. Updates rolling histories for flow, counts, and tracked positions.
10. Emits a zone record on sampled frames.

The default sample interval is every third frame. Batch mode writes a JSON array. Stream mode yields records continuously.

### 2.2 Detection and density

Each person detection contains a bounding box, confidence, center, and class ID. CrowdDetector assigns a detection to a zone based on its center.

Density is relative occupancy, not calibrated people per square meter:

    density_score = min(crowd_count / max_expected_count, 1.0)

For 40 people and a configured maximum of 50:

    density_score = min(40 / 50, 1.0) = 0.80

The configured maximum is important because arbitrary video normally has no real-world camera calibration.

### 2.3 Tracking

CrowdTracker stores persistent track IDs and recent positions. It uses the histories to identify:

- reverse movement against the dominant corridor direction;
- erratic or zig-zag movement;
- group scattering;
- bottleneck behavior.

Track histories are smoothed to reduce jitter. Teleporting tracks, commonly caused by an ID switch, are excluded from some anomaly calculations.

### 2.4 Optical flow

OpticalFlowAnalyzer uses Farneback dense optical flow. Every pixel receives a motion vector fx, fy.

For a zone:

    magnitude = sqrt(fx^2 + fy^2)
    average_speed = mean(magnitude)
    avg_flow_speed = min(average_speed / 10.0, 1.0)

The mean vector is converted to a compass direction using:

    direction_degrees = atan2(mean_fx, -mean_fy)

The result is mapped to N, NE, E, SE, S, SW, W, or NW.

The pipeline also retains raw pixel-per-frame speed and spatial variance:

    flow_spatial_variance = Var(fx) + Var(fy)

High variance indicates incoherent, turbulent movement and supports the flow-only bottleneck detector.

### 2.5 Anomaly rules

Reverse flow requires sufficiently fast track movement against the corridor direction. It must persist across multiple samples and normally involve at least two tracklets before reverse_flow is emitted.

Erratic movement is detected from repeated heading changes greater than 90 degrees, sufficient displacement, and group scattering with widely different headings. Tiny jitter is filtered out.

Bottleneck detection has two paths:

1. Person-backed path: the zone has meaningful density and crowd count, has a rolling flow speed, and then experiences a speed drop greater than 40 percent.
2. Flow-only path: raw flow remains high, spatial variance is high, and the condition persists across several samples. This can detect a surge even when YOLO detects no people.

The CV output includes reverse_flow_detected, bottleneck_detected, anomaly_flags, and tracked_ids_in_zone.

### 2.6 CV output

A typical sampled frame contains:

    {
      "timestamp": "...",
      "frame_number": 120,
      "source_id": "cam_01",
      "zones": [
        {
          "zone_id": "zone_A1",
          "bounds_normalized": {"x_min": 0, "y_min": 0, "x_max": 0.5, "y_max": 0.5},
          "crowd_count": 40,
          "density_score": 0.8,
          "avg_flow_speed": 0.42,
          "avg_flow_direction_deg": 180.0,
          "avg_flow_direction_label": "S",
          "neighbor_avg_flow_speed": 0.31,
          "reverse_flow_detected": false,
          "bottleneck_detected": true,
          "anomaly_flags": ["bottleneck"],
          "tracked_ids_in_zone": [12, 17, 22]
        }
      ],
      "frame_totals": {
        "total_crowd_count": 40,
        "max_zone_density": 0.8,
        "highest_risk_zone_id": "zone_A1"
      }
    }

## 3. Risk engine

Sources:

- ai_core/risk_engine/scripts/pipeline.py
- ai_core/risk_engine/scripts/risk_scorer.py
- ai_core/risk_engine/scripts/panic_diffusion.py
- ai_core/risk_engine/scripts/resource_allocator.py
- ai_core/risk_engine/scripts/route_blockage_predictor.py
- ai_core/risk_engine/scripts/pre_event_simulator.py

RiskEngine composes risk scoring, panic diffusion, resource allocation, route prediction, and pre-event simulation.

### 3.1 Risk score

RiskScorer calculates five normalized components:

| Component | Meaning | Weight |
|---|---|---:|
| density_score | Current normalized occupancy | 0.35 |
| density_rate_of_change | Average positive density increase | 0.25 |
| flow_convergence_score | Neighbor flow pointing into this zone | 0.20 |
| bottleneck_score | 1 when a bottleneck exists, otherwise 0 | 0.15 |
| anomaly_score | Number of anomaly flags divided by 3, clamped to 1 | 0.05 |

The base formula is:

    risk_score = clamp(
        0.35 * density_score
      + 0.25 * density_rate_of_change
      + 0.20 * flow_convergence_score
      + 0.15 * bottleneck_score
      + 0.05 * anomaly_score,
      0.0,
      1.0
    )

The weights sum to 1.0.

Density rate uses up to 20 previous records and positive changes only:

    positive_delta = max(current_density - previous_density, 0)
    density_rate_of_change = mean(positive_delta)

A density decrease therefore does not add negative risk.

### 3.2 Flow convergence

For each adjacent zone with nonzero flow:

1. Find the neighbor-to-current-zone centroid direction.
2. Compare the neighbor's flow direction with that target angle.
3. Count it as inward when the angle difference is at most 45 degrees.
4. Weight inward and total flow by neighbor speed.

    flow_convergence_score = inward_neighbor_speed / total_neighbor_speed

This identifies several streams converging on the same area.

### 3.3 Risk bands and overrides

| Score | Risk level |
|---:|---|
| less than 0.30 | low |
| 0.30 to less than 0.55 | moderate |
| 0.55 to less than 0.75 | high |
| 0.75 or higher | critical |

Safety overrides are then applied:

- Any bottleneck forces the score to at least 0.75.
- erratic_movement forces the score to at least 0.60.

These rules stop a dangerous movement pattern from being hidden by a low count or imperfect detection.

### 3.4 Panic diffusion

PanicDiffusionModel starts with current zone risk scores and crowd counts and simulates future pressure across the adjacency graph. Risk spreads from neighbors and decays over time.

The default orchestrator parameters are:

    diffusion_rate = 0.15
    decay_rate = 0.05

Conceptually:

    next_risk[i] = clamp(
        current_risk[i] * (1 - decay_rate)
      + diffusion_rate * neighbor_pressure[i],
      0.0,
      1.0
    )

The model returns simulated steps and a predicted crush timeline when a simulated zone crosses a dangerous threshold. The simulation is a forecast, not a learned physical crowd model.

### 3.5 Resources and routes

ResourceAllocator ranks zones using risk and contributing factors. Typical suggestions include crowd marshals, medical support, barriers, directional flow control, and communication.

RouteBlockagePredictor evaluates routes to exits using the route's zones, current risk, and simulated future risk. Known routes may be supplied; otherwise routes are inferred from the zone graph.

### 3.6 Risk output

RiskEngine returns:

    {
      "timestamp": "...",
      "zones": [
        {
          "zone_id": "zone_A1",
          "risk_score": 0.78,
          "risk_level": "critical",
          "contributing_factors": {
            "density_score": 0.8,
            "density_rate_of_change": 0.12,
            "flow_convergence_score": 0.7,
            "bottleneck_score": 1.0,
            "anomaly_score": 0.33,
            "weights": {},
            "weighted_components": {}
          }
        }
      ],
      "panic_propagation": {"simulated_steps": []},
      "predicted_crush_timeline": [],
      "resource_allocation_suggestions": [],
      "route_blockage_predictions": []
    }

## 4. GenAI pipeline

Sources:

- ai_core/genai_pipeline/scripts/pipeline.py
- ai_core/genai_pipeline/scripts/llm_client.py
- ai_core/genai_pipeline/scripts/recommendation_engine.py
- ai_core/genai_pipeline/scripts/incident_summary.py
- ai_core/genai_pipeline/scripts/translation_tts.py
- ai_core/genai_pipeline/scripts/voice_commands.py
- ai_core/genai_pipeline/scripts/sentiment_analysis.py

The GenAI layer consumes structured numerical state. It does not recalculate the core risk score.

### 4.1 Structured LLM calls

Prompts request JSON with explicit fields. Responses are parsed and validated before being returned. Deterministic fallbacks are used when the model is unavailable, returns invalid JSON, or times out.

### 4.2 Recommendations

RecommendationEngine receives the target zone, risk score, risk level, contributing factors, and neighboring zone summaries. It asks for 2 to 4 specific interventions.

Every item contains:

- action: imperative operator action;
- category: flow_management, resource_deployment, crowd_control, or communication;
- urgency: immediate, soon, or monitor;
- reasoning: explanation tied to a measured factor.

Rule-based fallback recommendations use bottleneck, flow convergence, reverse flow, and density values.

### 4.3 Incident summaries

IncidentSummaryGenerator converts a zone time series into an executive summary with peak risk, time at risk, likely cause, narrative, and resolution status. The result is displayed in incident reports and can be stored as an audit record.

### 4.4 Five-language announcements

MultilingualAnnouncer translates the operator's English message into:

- Hindi, code hi
- Tamil, code ta
- Telugu, code te
- Bengali, code bn
- Marathi, code mr

It then generates MP3 audio using Edge-TTS, with gTTS as a fallback when available. The result contains the base message, translated text, audio path, and generation timestamp.

If translation fails, the operator-authored text is preserved rather than replaced by an unrelated demo message. If all TTS providers fail, the system returns no audio path instead of a zero-byte placeholder.

### 4.5 Voice commands

The dashboard records a short microphone clip and sends it to POST /api/voice-command. Faster-Whisper transcribes it. VoiceCommandProcessor uses keyword and regular-expression matching.

| Example | Intent | Dashboard behavior |
|---|---|---|
| Show me Zone A1 | navigate_to_zone | Selects, pans to, and scrolls to the zone map |
| What is the risk in Zone A1? | query_risk_status | Reports current zone risk |
| Broadcast an evacuation alert | trigger_announcement | Prepares a public announcement |
| Close Gate 3 | close_gate | Issues the closure response |

The response contains transcribed_text, matched_intent, intent_params, and confidence. Unknown commands return unrecognized safely.

### 4.6 Sentiment

SentimentAnalyzer returns an aggregated unrest score, flagged posts, sentiment, and urgency. The prototype can use mocked social posts; the structured interface is ready for a live feed later.

## 5. Backend orchestration

Main source: backend/app/services/orchestrator.py

For each streamed CV record, EventOrchestrator:

1. Sends the record to RiskEngine.process_frame.
2. Adds propagation, crush timeline, resource, and route outputs.
3. Applies a weather multiplier to outdoor zones when configured.
4. Tracks prior risk levels in memory.
5. Prepares crowd metrics for persistence.
6. Detects escalation into high or critical.
7. Creates an immediate rule-based alert and recommendations.
8. Enhances recommendations with GenAI in a background task.
9. Persists the alert and invokes push notification hooks.
10. Broadcasts a combined payload through WebSocket.

An alert is created when a zone changes from low or moderate to high, or from low, moderate, or high to critical. Active tracking is cleared when the zone returns to low or moderate.

## 6. Communication interfaces

### WebSocket

The live endpoint is /ws/live. A normal update contains:

    {
      "timestamp": "...",
      "cv_data": {"zones": [], "frame_totals": {}},
      "risk_data": {
        "zones": [],
        "panic_propagation": {},
        "predicted_crush_timeline": [],
        "resource_allocation_suggestions": []
      },
      "frames_processed": 120,
      "type": "frame_update"
    }

Escalations add type alert, alert, and new_alerts.

The dashboard consumes this stream through its live data store. It updates the map, analytics, alerts, intervention cards, and 3D view. The mobile app can consume the same backend state for citizen alerts and safer routing.

### REST

Important routes:

| Route | Purpose |
|---|---|
| POST /api/announcements | Translate and synthesize a public announcement |
| POST /api/voice-command | Transcribe and classify operator speech |
| GET /api/zones | Load zone definitions |
| GET /api/incidents | Read incident reports |
| POST /api/incidents | Submit incident reports |
| GET /api/trends/{zone_id} | Read historical zone metrics |
| POST /api/simulations/pre-event | Run arrival-buildup simulation |
| POST /api/webhooks/signage | Simulate signage dispatch |
| /ws/live | Stream live CV and risk frames |

Supabase stores metrics, risk alerts, interventions, reports, and related audit data. WebSockets serve low-latency live updates; REST serves commands, queries, and generated artifacts.

## 7. Dashboard behavior

The dashboard does not independently recalculate risk. It renders structured backend data.

- Live venue map: polygons from normalized bounds, colored by risk level.
- Zone focus: selected zones are highlighted; voice navigation pans and scrolls the map into view.
- Analytics: live and historical density, risk, count, and trend data.
- AI interventions: escalation cards show recommendations and reasoning.
- Announcements: translated text and generated audio paths are displayed for the five languages.
- Voice controls: microphone input becomes an intent and dashboard action.

Announcement audio is served from the backend audio directory. The shared audio manager ensures only one announcement plays at a time. Browser speech synthesis is available when no generated audio URL exists.

## 8. Pre-event simulation

The pre-event simulator accepts zone configuration, expected attendance, entry zones, arrival duration, and number of steps. It distributes arrivals through entry zones and adjacency, scores buildup, and flags bottleneck risks. It is useful for comparing venue layouts before live footage is available.

## 9. Limitations and assumptions

1. Density is relative to max_expected_count, not calibrated people per square meter.
2. YOLOv8n can be affected by occlusion, lighting, camera angle, and dense overlap.
3. Optical flow can be contaminated by camera movement.
4. Risk weights and thresholds are heuristic prototype values and should be calibrated with venue data.
5. Panic diffusion is a simulation.
6. LLM recommendations require operator review before real-world action.
7. TTS requires a working provider or browser fallback.
8. Some social, push, signage, and external integrations are simulated.
9. The system is decision support; human operators remain responsible for confirmation and action.

## 10. Main source files

| Layer | Files |
|---|---|
| Zones | ai_core/shared/zone_config.py |
| Detection | ai_core/cv_pipeline/scripts/detector.py |
| Tracking and anomalies | ai_core/cv_pipeline/scripts/tracker.py |
| Optical flow | ai_core/cv_pipeline/scripts/optical_flow.py |
| CV orchestration | ai_core/cv_pipeline/scripts/pipeline.py |
| Risk scoring | ai_core/risk_engine/scripts/risk_scorer.py |
| Risk orchestration | ai_core/risk_engine/scripts/pipeline.py |
| Panic diffusion | ai_core/risk_engine/scripts/panic_diffusion.py |
| Recommendations | ai_core/genai_pipeline/scripts/recommendation_engine.py |
| Translation and TTS | ai_core/genai_pipeline/scripts/translation_tts.py |
| Voice commands | ai_core/genai_pipeline/scripts/voice_commands.py |
| GenAI orchestration | ai_core/genai_pipeline/scripts/pipeline.py |
| Live backend loop | backend/app/services/orchestrator.py |
| Dashboard API client | dashboard/src/api/client.ts |
| Dashboard live store | dashboard/src/store/liveDataStore.ts |

