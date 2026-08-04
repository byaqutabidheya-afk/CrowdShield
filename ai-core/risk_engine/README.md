# risk_engine

Risk prediction and simulation engine (Phase 2). Consumes the structured JSON
output of `cv_pipeline` and produces per-zone risk scores, panic-propagation
simulations, fast-forward crush predictions, pre-event stress tests, resource
allocation suggestions, and route blockage predictions.

## Subfolders

| Folder | Purpose |
|---|---|
| `scripts/` | Risk scoring, panic diffusion model, pre-event simulator, resource allocator, route blockage predictor, and the orchestration pipeline. |

**Status:** Scaffolding only — no logic implemented yet.
