-- ==============================================================================
-- CrowdShield Supabase Database Schema
-- ==============================================================================
-- INSTRUCTIONS FOR SETUP:
-- 1. Open your Supabase Dashboard for the CrowdShield project.
-- 2. Navigate to the SQL Editor tab in the left sidebar.
-- 3. Paste the contents of this schema file into the query editor and click 'Run'.
--
-- REALTIME REPLICATION NOTE:
-- Enable Realtime replication on the following tables via the Supabase Dashboard:
--   - crowd_metrics
--   - risk_alerts
-- Instructions: Go to Dashboard -> Database -> Replication, and toggle ON
-- Realtime for `crowd_metrics` and `risk_alerts`.
-- (This step must be performed in the Supabase UI as it cannot be set via standard DDL alone).
-- ==============================================================================

-- 1. zones
CREATE TABLE IF NOT EXISTS zones (
    zone_id text PRIMARY KEY,
    venue_id text NOT NULL,
    bounds_normalized jsonb NOT NULL,
    max_expected_count integer DEFAULT 50 NOT NULL,
    adjacency jsonb DEFAULT '[]'::jsonb NOT NULL,
    detection_confidence double precision,
    detection_imgsz integer,
    model_weights_path text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. venue_configs
CREATE TABLE IF NOT EXISTS venue_configs (
    venue_id text PRIMARY KEY,
    diffusion_rate double precision DEFAULT 0.15 NOT NULL,
    decay_rate double precision DEFAULT 0.05 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. crowd_metrics
CREATE TABLE IF NOT EXISTS crowd_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id text NOT NULL REFERENCES zones(zone_id) ON DELETE CASCADE,
    timestamp timestamptz NOT NULL,
    crowd_count integer NOT NULL,
    density_score double precision NOT NULL,
    avg_flow_speed double precision NOT NULL,
    avg_flow_direction_deg double precision NOT NULL,
    risk_score double precision NOT NULL,
    risk_level text NOT NULL,
    anomaly_flags jsonb DEFAULT '[]'::jsonb,
    contributing_factors jsonb DEFAULT '{}'::jsonb
);

-- 4. risk_alerts
CREATE TABLE IF NOT EXISTS risk_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id text NOT NULL REFERENCES zones(zone_id) ON DELETE CASCADE,
    triggered_at timestamptz NOT NULL,
    resolved_at timestamptz,
    peak_risk_score double precision NOT NULL,
    risk_level_at_trigger text NOT NULL,
    recommendations jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'active' NOT NULL
);

-- 5. incident_reports
CREATE TABLE IF NOT EXISTS incident_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL,
    zone_id text REFERENCES zones(zone_id) ON DELETE SET NULL,
    submitted_at timestamptz DEFAULT now() NOT NULL,
    gps_coordinates jsonb,
    photo_url text,
    notes text NOT NULL,
    ai_summary jsonb,
    client_device_id text
);

-- 6. interventions
CREATE TABLE IF NOT EXISTS interventions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id text NOT NULL REFERENCES zones(zone_id) ON DELETE CASCADE,
    action_taken text NOT NULL,
    category text NOT NULL,
    triggered_by text NOT NULL,
    timestamp timestamptz DEFAULT now() NOT NULL
);

-- 7. devices
CREATE TABLE IF NOT EXISTS devices (
    push_token text PRIMARY KEY,
    last_known_location jsonb,
    registered_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_crowd_metrics_zone_timestamp ON crowd_metrics (zone_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_zone_status ON risk_alerts (zone_id, status);
