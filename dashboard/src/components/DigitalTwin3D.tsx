import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Box, OrbitControls, Text } from '@react-three/drei';
import { getZones, postPreEventSimulation } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type { CVZoneMetric, RiskData, RiskZoneMetric, WebSocketFrameMessage, ZoneConfig } from '../types/api';

export interface DigitalTwin3DProps {
  className?: string;
  style?: CSSProperties;
}

type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
type SimulationSource = 'prediction' | 'pre-event';
type SimulationStepRecord = Record<string, any>;

const FLOOR_SIZE = 20;
const FLOOR_HALF = FLOOR_SIZE / 2;
const SIMULATION_PLAY_INTERVAL_MS = 800;

const RISK_COLOR_MAP: Record<RiskLevel, THREE.Color> = {
  low: new THREE.Color('#22c55e'),
  moderate: new THREE.Color('#eab308'),
  high: new THREE.Color('#f97316'),
  critical: new THREE.Color('#ef4444'),
};

const EMPTY_RISK_ZONES: RiskZoneMetric[] = [];
const EMPTY_CV_ZONES: CVZoneMetric[] = [];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (current: number, target: number, factor: number) => current + (target - current) * factor;

function mapNormalizedRectToWorld(bounds: ZoneConfig['bounds_normalized']) {
  const xMin = clamp01(bounds.x_min) * FLOOR_SIZE - FLOOR_HALF;
  const xMax = clamp01(bounds.x_max) * FLOOR_SIZE - FLOOR_HALF;

  // Normalized venue coordinates map into a centered 20x20 world with the Y axis inverted for floor-plan style layouts.
  const zMin = FLOOR_HALF - clamp01(bounds.y_max) * FLOOR_SIZE;
  const zMax = FLOOR_HALF - clamp01(bounds.y_min) * FLOOR_SIZE;

  return {
    center: [(xMin + xMax) / 2, 0, (zMin + zMax) / 2] as [number, number, number],
    size: [Math.max(0.18, xMax - xMin), 1, Math.max(0.18, zMax - zMin)] as [number, number, number],
  };
}

function getRiskLevel(riskLevel?: string): RiskLevel {
  const normalized = (riskLevel || '').toLowerCase();
  if (normalized === 'moderate' || normalized === 'high' || normalized === 'critical') {
    return normalized;
  }
  return 'low';
}

function extractZoneArrays(source: unknown) {
  const sourceObject = source as Record<string, any> | null | undefined;
  const riskZones = Array.isArray(sourceObject?.risk_data?.zones)
    ? sourceObject?.risk_data?.zones
    : Array.isArray(sourceObject?.zones)
      ? sourceObject.zones
      : Array.isArray(sourceObject?.risk_zones)
        ? sourceObject.risk_zones
        : EMPTY_RISK_ZONES;
  const cvZones = Array.isArray(sourceObject?.cv_data?.zones)
    ? sourceObject?.cv_data?.zones
    : Array.isArray(sourceObject?.zones)
      ? sourceObject.zones
      : Array.isArray(sourceObject?.cv_zones)
        ? sourceObject.cv_zones
        : EMPTY_CV_ZONES;

  return {
    riskZones: riskZones.filter((zone: any) => zone && typeof zone.zone_id === 'string'),
    cvZones: cvZones.filter((zone: any) => zone && typeof zone.zone_id === 'string'),
  };
}

function buildZoneMaps(source: unknown) {
  const { riskZones, cvZones } = extractZoneArrays(source);

  return {
    riskByZoneId: new Map<string, RiskZoneMetric>(riskZones.map((zone: RiskZoneMetric) => [zone.zone_id, zone])),
    cvByZoneId: new Map<string, CVZoneMetric>(cvZones.map((zone: CVZoneMetric) => [zone.zone_id, zone])),
  };
}

function normalizeSimulationSteps(data: unknown): SimulationStepRecord[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter((item): item is SimulationStepRecord => Boolean(item) && typeof item === 'object');
}

function getRiskWeight(zone: RiskZoneMetric | undefined, cvZone: CVZoneMetric | undefined) {
  const riskLevel = getRiskLevel(zone?.risk_level);
  const riskScore = Math.max(0, zone?.risk_score ?? 0);
  const densityScore = Math.max(0, cvZone?.density_score ?? 0);

  return {
    riskLevel,
    heightTarget: Math.max(0.3, 0.18 + Math.max(riskScore / 45, densityScore / 6) * 3.2),
    colorTarget: RISK_COLOR_MAP[riskLevel],
  };
}

function getSimulationStepLabel(step: SimulationStepRecord | undefined, index: number) {
  if (!step) {
    return `Step ${index + 1}`;
  }

  const timeOffset =
    step.time_offset ??
    step.timeOffset ??
    step.offset_seconds ??
    step.offsetSeconds ??
    step.offset;

  if (typeof timeOffset === 'number' && Number.isFinite(timeOffset)) {
    return `Step ${index + 1} · t+${timeOffset}s`;
  }

  if (typeof step.timestamp === 'string' || typeof step.timestamp === 'number') {
    return `Step ${index + 1} · ${String(step.timestamp)}`;
  }

  return `Step ${index + 1}`;
}

function ZoneVolume({
  zoneConfig,
  riskZone,
  cvZone,
}: {
  zoneConfig: ZoneConfig;
  riskZone?: RiskZoneMetric;
  cvZone?: CVZoneMetric;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const target = useMemo(() => getRiskWeight(riskZone, cvZone), [cvZone, riskZone]);
  const layout = useMemo(() => mapNormalizedRectToWorld(zoneConfig.bounds_normalized), [zoneConfig.bounds_normalized]);
  const labelRiskScore = Math.max(0, riskZone?.risk_score ?? 0).toFixed(1);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) {
      return;
    }

    const smoothFactor = 1 - Math.pow(0.001, delta);
    const nextScaleY = lerp(mesh.scale.y, target.heightTarget, smoothFactor);
    mesh.scale.y = nextScaleY;
    mesh.position.y = nextScaleY / 2;
    material.color.lerp(target.colorTarget, smoothFactor);
    material.emissive.lerp(target.colorTarget.clone().multiplyScalar(0.25), smoothFactor);
  });

  return (
    <Box ref={meshRef} args={layout.size} position={layout.center} castShadow receiveShadow>
      <meshStandardMaterial
        ref={materialRef}
        color={target.colorTarget}
        emissive={target.colorTarget.clone().multiplyScalar(0.2)}
        roughness={0.58}
        metalness={0.04}
        transparent
        opacity={0.92}
      />

      <Billboard follow lockX={false} lockY={false} lockZ={false} position={[0, 3.4, 0]}>
        <Text
          fontSize={0.42}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#050811"
          textAlign="center"
          depthOffset={-1}
        >
          {`${zoneConfig.zone_id}\nRisk ${labelRiskScore}`}
        </Text>
      </Billboard>
    </Box>
  );
}

function SimulationControls({
  isSimulationMode,
  simulationSource,
  onToggleSimulationMode,
  onSelectSimulationSource,
  onLoadLivePrediction,
  livePredictionAvailable,
  zoneConfigs,
  entryZoneId,
  onEntryZoneChange,
  expectedAttendance,
  onExpectedAttendanceChange,
  onSubmitPreEvent,
  isSubmittingPreEvent,
  simulationMessage,
}: {
  isSimulationMode: boolean;
  simulationSource: SimulationSource;
  onToggleSimulationMode: () => void;
  onSelectSimulationSource: (source: SimulationSource) => void;
  onLoadLivePrediction: () => void;
  livePredictionAvailable: boolean;
  zoneConfigs: ZoneConfig[];
  entryZoneId: string;
  onEntryZoneChange: (value: string) => void;
  expectedAttendance: number;
  onExpectedAttendanceChange: (value: number) => void;
  onSubmitPreEvent: (event: React.FormEvent<HTMLFormElement>) => void;
  isSubmittingPreEvent: boolean;
  simulationMessage: string | null;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 30,
        width: '250px',
        padding: '0.8rem',
        borderRadius: '12px',
        border: isSimulationMode ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid rgba(56, 189, 248, 0.22)',
        background: 'rgba(9, 16, 29, 0.94)',
        boxShadow: isSimulationMode ? '0 0 0 1px rgba(59, 130, 246, 0.22), 0 14px 34px rgba(0, 0, 0, 0.42)' : '0 14px 34px rgba(0, 0, 0, 0.34)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: isSimulationMode ? '#c4b5fd' : '#cbd5e1',
          marginBottom: '0.55rem',
        }}
      >
        Simulation Mode
      </div>

      <button
        type="button"
        onClick={onToggleSimulationMode}
        style={{
          width: '100%',
          border: '1px solid rgba(56, 189, 248, 0.18)',
          borderRadius: '8px',
          background: isSimulationMode ? 'linear-gradient(135deg, rgba(91, 33, 182, 0.92), rgba(37, 99, 235, 0.88))' : 'rgba(15, 23, 42, 0.72)',
          color: '#e2e8f0',
          padding: '0.55rem 0.7rem',
          fontSize: '0.72rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {isSimulationMode ? 'Exit Simulation' : 'Enter Simulation Mode'}
      </button>

      {isSimulationMode && (
        <>
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.65rem' }}>
            <button
              type="button"
              onClick={onLoadLivePrediction}
              disabled={!livePredictionAvailable}
              style={{
                width: '100%',
                border: '1px solid rgba(56, 189, 248, 0.18)',
                borderRadius: '8px',
                background: simulationSource === 'prediction' ? 'rgba(37, 99, 235, 0.82)' : 'rgba(15, 23, 42, 0.72)',
                color: '#e2e8f0',
                padding: '0.5rem 0.65rem',
                fontSize: '0.71rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: livePredictionAvailable ? 'pointer' : 'not-allowed',
                opacity: livePredictionAvailable ? 1 : 0.55,
              }}
            >
              Live Fast-Forward Prediction
            </button>

            <div
              style={{
                padding: '0.6rem',
                borderRadius: '10px',
                border: '1px solid rgba(56, 189, 248, 0.14)',
                background: simulationSource === 'pre-event' ? 'rgba(91, 33, 182, 0.18)' : 'rgba(15, 23, 42, 0.46)',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectSimulationSource('pre-event')}
                style={{
                  width: '100%',
                  marginBottom: '0.55rem',
                  border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: '8px',
                  background: simulationSource === 'pre-event' ? 'linear-gradient(135deg, rgba(91, 33, 182, 0.92), rgba(59, 130, 246, 0.9))' : 'rgba(15, 23, 42, 0.72)',
                  color: '#e2e8f0',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.71rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Pre-Event Stress Test
              </button>

              {simulationSource === 'pre-event' && (
                <form onSubmit={onSubmitPreEvent} style={{ display: 'grid', gap: '0.5rem' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Entry Zone
                    </span>
                    <select
                      value={entryZoneId}
                      onChange={(event) => onEntryZoneChange(event.target.value)}
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.24)',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        padding: '0.45rem 0.55rem',
                        fontSize: '0.76rem',
                      }}
                    >
                      {zoneConfigs.length === 0 ? (
                        <option value="">Loading zones...</option>
                      ) : (
                        zoneConfigs.map((zone) => (
                          <option key={zone.zone_id} value={zone.zone_id}>
                            {zone.zone_id}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Expected Attendance
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={expectedAttendance}
                      onChange={(event) => onExpectedAttendanceChange(Number(event.target.value) || 0)}
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.24)',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        padding: '0.45rem 0.55rem',
                        fontSize: '0.76rem',
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmittingPreEvent}
                    style={{
                      width: '100%',
                      border: '1px solid rgba(56, 189, 248, 0.18)',
                      borderRadius: '8px',
                      background: 'rgba(59, 130, 246, 0.82)',
                      color: '#e2e8f0',
                      padding: '0.5rem 0.65rem',
                      fontSize: '0.71rem',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      cursor: isSubmittingPreEvent ? 'wait' : 'pointer',
                      opacity: isSubmittingPreEvent ? 0.7 : 1,
                    }}
                  >
                    {isSubmittingPreEvent ? 'Running Test...' : 'Run Stress Test'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {simulationMessage && (
            <div
              style={{
                marginTop: '0.65rem',
                padding: '0.55rem 0.65rem',
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                background: 'rgba(15, 23, 42, 0.56)',
                color: '#cbd5e1',
                fontSize: '0.72rem',
                lineHeight: 1.35,
              }}
            >
              {simulationMessage}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SimulationTimeline({
  isSimulationMode,
  simulationSource,
  simulationSteps,
  selectedStepIndex,
  onSelectedStepChange,
  isPlaying,
  onTogglePlay,
  onExitSimulation,
}: {
  isSimulationMode: boolean;
  simulationSource: SimulationSource;
  simulationSteps: SimulationStepRecord[];
  selectedStepIndex: number;
  onSelectedStepChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExitSimulation: () => void;
}) {
  if (!isSimulationMode || simulationSteps.length === 0) {
    return null;
  }

  const currentStep = simulationSteps[selectedStepIndex];
  const currentLabel = getSimulationStepLabel(currentStep, selectedStepIndex);

  return (
    <div
      style={{
        padding: '0.75rem 0.9rem 0.85rem',
        borderTop: '1px solid rgba(139, 92, 246, 0.22)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.94) 0%, rgba(17, 24, 39, 0.98) 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.55rem',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#c4b5fd',
            }}
          >
            SIMULATION MODE — not live data
          </div>
          <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '0.2rem' }}>{currentLabel}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onTogglePlay}
            style={{
              border: '1px solid rgba(148, 163, 184, 0.22)',
              borderRadius: '8px',
              background: isPlaying ? 'rgba(91, 33, 182, 0.88)' : 'rgba(15, 23, 42, 0.72)',
              color: '#e2e8f0',
              padding: '0.5rem 0.75rem',
              fontSize: '0.71rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            onClick={onExitSimulation}
            style={{
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderRadius: '8px',
              background: 'rgba(17, 24, 39, 0.82)',
              color: '#fecaca',
              padding: '0.5rem 0.75rem',
              fontSize: '0.71rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Exit Simulation
          </button>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, simulationSteps.length - 1)}
        step={1}
        value={selectedStepIndex}
        onChange={(event) => onSelectedStepChange(Number(event.target.value))}
        aria-label="Simulation timeline scrubber"
        style={{ width: '100%' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginTop: '0.4rem',
          fontSize: '0.66rem',
          color: '#94a3b8',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
        }}
      >
        <span>{getSimulationStepLabel(simulationSteps[0], 0)}</span>
        <span>{simulationSource === 'prediction' ? 'Live fast-forward' : 'Pre-event stress test'}</span>
        <span>{getSimulationStepLabel(simulationSteps[simulationSteps.length - 1], simulationSteps.length - 1)}</span>
      </div>
    </div>
  );
}

export const DigitalTwin3D: React.FC<DigitalTwin3DProps> = ({ className, style }) => {
  const [zoneConfigs, setZoneConfigs] = useState<ZoneConfig[]>([]);
  const latestFrame = useLiveDataStore((state) => state.latestFrame);

  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulationSource, setSimulationSource] = useState<SimulationSource>('prediction');
  const [simulationSteps, setSimulationSteps] = useState<SimulationStepRecord[]>([]);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubmittingPreEvent, setIsSubmittingPreEvent] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState<string | null>(null);
  const [simulationSnapshotFrame, setSimulationSnapshotFrame] = useState<WebSocketFrameMessage | null>(null);
  const [entryZoneId, setEntryZoneId] = useState('');
  const [expectedAttendance, setExpectedAttendance] = useState(3000);

  const liveFrameMaps = useMemo(() => buildZoneMaps(latestFrame), [latestFrame]);
  const snapshotFrameMaps = useMemo(() => buildZoneMaps(simulationSnapshotFrame), [simulationSnapshotFrame]);
  const currentSimulationStep = isSimulationMode ? simulationSteps[selectedStepIndex] : null;
  const simulationStepMaps = useMemo(() => buildZoneMaps(currentSimulationStep), [currentSimulationStep]);

  const activeMaps = isSimulationMode
    ? simulationStepMaps.riskByZoneId.size > 0 || simulationStepMaps.cvByZoneId.size > 0
      ? simulationStepMaps
      : snapshotFrameMaps.riskByZoneId.size > 0 || snapshotFrameMaps.cvByZoneId.size > 0
        ? snapshotFrameMaps
        : liveFrameMaps
    : liveFrameMaps;

  const livePredictionSteps = useMemo(() => {
    const riskData = latestFrame?.risk_data as RiskData | undefined;
    const rawRiskData = riskData as unknown as Record<string, any> | undefined;
    return normalizeSimulationSteps(riskData?.predicted_crush_timeline ?? rawRiskData?.panic_propagation ?? rawRiskData?.predicted_crush_timeline);
  }, [latestFrame?.risk_data]);

  useEffect(() => {
    let isMounted = true;

    const loadZones = async () => {
      try {
        const zones = await getZones();
        if (isMounted) {
          setZoneConfigs(zones);
          setEntryZoneId((current) => current || zones[0]?.zone_id || '');
        }
      } catch (error) {
        console.error('[DigitalTwin3D] Failed to load zone configs:', error);
      }
    };

    loadZones();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedStepIndex((current) => Math.min(current, Math.max(0, simulationSteps.length - 1)));
  }, [simulationSteps.length]);

  useEffect(() => {
    if (!isSimulationMode || !isPlaying || simulationSteps.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setSelectedStepIndex((current) => {
        if (current >= simulationSteps.length - 1) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return current;
        }

        return current + 1;
      });
    }, SIMULATION_PLAY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying, isSimulationMode, simulationSteps.length]);

  const activeZoneConfigs = useMemo(() => {
    return zoneConfigs.filter((zoneConfig) => {
      return activeMaps.riskByZoneId.has(zoneConfig.zone_id) || activeMaps.cvByZoneId.has(zoneConfig.zone_id);
    });
  }, [activeMaps.cvByZoneId, activeMaps.riskByZoneId, zoneConfigs]);

  const handleToggleSimulationMode = () => {
    setIsSimulationMode((current) => {
      const nextValue = !current;

      if (nextValue) {
        setSimulationSnapshotFrame(latestFrame);
        setSimulationMessage('Live rendering paused. Choose a simulation source.');
      } else {
        setIsPlaying(false);
        setSelectedStepIndex(0);
        setSimulationMessage(null);
      }

      return nextValue;
    });
  };

  const loadSimulationSteps = (source: SimulationSource, steps: SimulationStepRecord[], message: string) => {
    setIsSimulationMode(true);
    setSimulationSource(source);
    setSimulationSteps(steps);
    setSelectedStepIndex(0);
    setIsPlaying(false);
    setSimulationSnapshotFrame(latestFrame);
    setSimulationMessage(message);
  };

  const handleLoadLivePrediction = () => {
    if (livePredictionSteps.length === 0) {
      setSimulationMessage('No live prediction timeline is available yet from the WebSocket feed.');
      setIsSimulationMode(true);
      setSimulationSource('prediction');
      setSimulationSnapshotFrame(latestFrame);
      return;
    }

    loadSimulationSteps('prediction', livePredictionSteps, `Loaded ${livePredictionSteps.length} live prediction steps.`);
  };

  const handleSelectSimulationSource = (source: SimulationSource) => {
    setIsSimulationMode(true);
    setSimulationSource(source);
    setIsPlaying(false);
    setSimulationSnapshotFrame(latestFrame);
    setSimulationMessage(
      source === 'pre-event'
        ? 'Configure the pre-event stress test and submit the simulation.'
        : 'Live rendering paused. Loading the fast-forward prediction will replace the timeline.'
    );
  };

  const handlePreEventSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!entryZoneId) {
      setSimulationMessage('Select an entry zone before running the stress test.');
      return;
    }

    if (zoneConfigs.length === 0) {
      setSimulationMessage('Zone configurations are still loading. Please try again in a moment.');
      return;
    }

    setIsSubmittingPreEvent(true);
    setSimulationMessage('Running pre-event stress test...');

    try {
      const response = await postPreEventSimulation({
        zones: zoneConfigs as Record<string, any>[],
        entry_zone_ids: [entryZoneId],
        expected_attendance: expectedAttendance,
      });

      const responseObject = response as Record<string, any>;
      const steps = normalizeSimulationSteps(
        response.steps ?? responseObject.simulation_steps ?? responseObject.timeline ?? responseObject.predicted_crush_timeline
      );

      if (steps.length === 0) {
        setSimulationMessage('Pre-event test completed, but no step-by-step simulation was returned.');
        setIsSimulationMode(true);
        setSimulationSource('pre-event');
        setSimulationSnapshotFrame(latestFrame);
        setSimulationSteps([]);
        setSelectedStepIndex(0);
        return;
      }

      loadSimulationSteps('pre-event', steps, `Loaded ${steps.length} pre-event simulation steps.`);
    } catch (error) {
      console.error('[DigitalTwin3D] Failed to run pre-event simulation:', error);
      setSimulationMessage('Pre-event stress test failed. Check the backend response and try again.');
    } finally {
      setIsSubmittingPreEvent(false);
    }
  };

  const handleExitSimulation = () => {
    setIsSimulationMode(false);
    setIsPlaying(false);
    setSelectedStepIndex(0);
    setSimulationMessage(null);
  };

  const handleTogglePlay = () => {
    if (!isSimulationMode || simulationSteps.length <= 1) {
      return;
    }

    setIsPlaying((current) => !current);
  };

  const activeFrameLabel = isSimulationMode
    ? simulationSource === 'prediction'
      ? 'SIMULATION SOURCE: LIVE FAST-FORWARD PREDICTION'
      : 'SIMULATION SOURCE: PRE-EVENT STRESS TEST'
    : 'LIVE WEB SOCKET RENDERING';

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: '8px',
        border: isSimulationMode ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid var(--border-panel)',
        background: 'linear-gradient(180deg, #09101d 0%, #050811 100%)',
        boxShadow: isSimulationMode ? '0 0 0 1px rgba(59, 130, 246, 0.18), 0 0 24px rgba(91, 33, 182, 0.14)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <Canvas
          shadows
          camera={{ position: [8, 8, 8], fov: 45, near: 0.1, far: 100 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false }}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={0.65} />
          <directionalLight
            position={[8, 12, 6]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
            shadow-camera-near={0.5}
            shadow-camera-far={50}
          />

          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#111827" roughness={0.95} metalness={0.02} />
          </mesh>

          {activeZoneConfigs.map((zoneConfig) => (
            <ZoneVolume
              key={zoneConfig.zone_id}
              zoneConfig={zoneConfig}
              riskZone={activeMaps.riskByZoneId.get(zoneConfig.zone_id)}
              cvZone={activeMaps.cvByZoneId.get(zoneConfig.zone_id)}
            />
          ))}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            screenSpacePanning
            maxPolarAngle={Math.PI / 2.05}
            minDistance={4}
            maxDistance={30}
          />
        </Canvas>

        {isSimulationMode && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 25,
              padding: '0.55rem 0.75rem',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, rgba(91, 33, 182, 0.94), rgba(37, 99, 235, 0.92))',
              border: '1px solid rgba(196, 181, 253, 0.34)',
              color: '#f8fafc',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              boxShadow: '0 10px 24px rgba(91, 33, 182, 0.24)',
              pointerEvents: 'none',
            }}
          >
            SIMULATION MODE — not live data
            <span style={{ color: '#ddd6fe', marginLeft: '0.55rem' }}>{activeFrameLabel}</span>
          </div>
        )}

        <SimulationControls
          isSimulationMode={isSimulationMode}
          simulationSource={simulationSource}
          onToggleSimulationMode={handleToggleSimulationMode}
          onSelectSimulationSource={handleSelectSimulationSource}
          onLoadLivePrediction={handleLoadLivePrediction}
          livePredictionAvailable={livePredictionSteps.length > 0}
          zoneConfigs={zoneConfigs}
          entryZoneId={entryZoneId}
          onEntryZoneChange={setEntryZoneId}
          expectedAttendance={expectedAttendance}
          onExpectedAttendanceChange={setExpectedAttendance}
          onSubmitPreEvent={handlePreEventSubmit}
          isSubmittingPreEvent={isSubmittingPreEvent}
          simulationMessage={simulationMessage}
        />
      </div>

      <SimulationTimeline
        isSimulationMode={isSimulationMode}
        simulationSource={simulationSource}
        simulationSteps={simulationSteps}
        selectedStepIndex={selectedStepIndex}
        onSelectedStepChange={setSelectedStepIndex}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onExitSimulation={handleExitSimulation}
      />
    </div>
  );
};

export default DigitalTwin3D;