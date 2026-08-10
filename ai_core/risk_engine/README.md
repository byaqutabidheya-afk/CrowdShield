# risk_engine

Risk prediction and simulation engine (Phase 2). This layer consumes the Phase 1 CV output and turns it into per-zone risk scoring, panic propagation, resource allocation suggestions, route blockage predictions, and offline pre-event buildup simulations.

## Pipeline Overview

The main entry point is [scripts/pipeline.py](scripts/pipeline.py). It wires together:

- `RiskScorer` for per-zone risk scoring.
- `PanicDiffusionModel` for short-horizon panic propagation.
- `ResourceAllocator` for suggested deployment actions.
- `RouteBlockagePredictor` for route-level blockage risk.
- `PreEventSimulator` for offline planning runs.

## Tuning the Weights

`RiskScorer` uses class-level weights that are intentionally easy to tune:

- `w_density = 0.35`
- `w_rate = 0.25`
- `w_convergence = 0.20`
- `w_bottleneck = 0.15`
- `w_anomaly = 0.05`

For hackathon demo work, you can adjust them directly on the class before scoring:

```python
from risk_scorer import RiskScorer

RiskScorer.w_density = 0.40
RiskScorer.w_rate = 0.20
RiskScorer.w_convergence = 0.20
RiskScorer.w_bottleneck = 0.15
RiskScorer.w_anomaly = 0.05
```

## Phase 8 Fine-Tuning Plan

When you have real demo footage and labeled incidents, use the stored Phase 2 outputs to calibrate these weights:

1. Collect frames where a known crowd incident, bottleneck, or route blockage occurred.
2. Compare the observed incident zones against the model’s `contributing_factors` output.
3. Increase the weight of factors that consistently preceded real incidents and decrease the ones that fired too often without incident.
4. Re-run the same footage through the pipeline and measure precision/recall on zone-level alerts and route blockage warnings.
5. Freeze the tuned values into a demo profile, then keep the original defaults as the conservative fallback profile.

For the hackathon, the goal is not perfect predictive accuracy. The goal is a stable, explainable baseline that can be visibly improved once real footage is available.

## CLI Usage

Process a Phase 1 array of frames into Phase 2 outputs:

```bash
python scripts/pipeline.py --input path/to/phase1_frames.json --output path/to/phase2_output.json
```

Run offline pre-event simulation instead of processing live frames:

```bash
python scripts/pipeline.py --pre-event --zones-config path/to/zones.json --attendance 2000 --output path/to/pre_event.json
```

If you do not supply `--entry-zone-ids` in pre-event mode, the CLI uses the lowest-row zones in the config as the default entry zone set.
