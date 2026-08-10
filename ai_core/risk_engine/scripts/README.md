# risk_engine / scripts

Will contain the Phase 2 risk engine modules:

- `zone_adjacency.py` — compute zone adjacency from normalized bounds.
- `risk_scorer.py` — `RiskScorer` (multi-factor risk scoring + level bucketing).
- `panic_diffusion.py` — `PanicDiffusionModel` (cellular-automaton panic spread).
- `pre_event_simulator.py` — `PreEventSimulator` (offline stress testing).
- `resource_allocator.py` — `ResourceAllocator` (heuristic allocation suggestions).
- `route_blockage_predictor.py` — `RouteBlockagePredictor` (full-path risk).
- `pipeline.py` — `RiskEngine` orchestrator with CLI.

**Status:** Scaffolding only — no logic implemented yet.
