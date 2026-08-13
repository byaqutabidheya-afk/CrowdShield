import React, { CSSProperties, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { ImageOverlay, MapContainer, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getZones } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type { CVZoneMetric, RiskZoneMetric, ZoneConfig } from '../types/api';

export interface VenueMapDimensions {
  width: number;
  height: number;
}

export interface NormalizedZoneBounds {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export type SimpleCrsPoint = [number, number];

export interface LiveVenueMapProps {
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  isLiveFeedReady?: boolean;
  selectedZoneId?: string | null;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_IMAGE_WIDTH = 1600;
const DEFAULT_IMAGE_HEIGHT = 900;

const RISK_LEVEL_STYLE: Record<string, { fill: string; stroke: string }> = {
  low: { fill: '#22c55e', stroke: '#16a34a' },
  moderate: { fill: '#eab308', stroke: '#ca8a04' },
  high: { fill: '#f97316', stroke: '#ea580c' },
  critical: { fill: '#ef4444', stroke: '#dc2626' },
};

const FLOW_ARROW_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1rem',
  height: '1rem',
  lineHeight: 1,
  transition: 'transform 160ms ease',
  transformOrigin: '50% 50%',
};

const BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.18rem 0.45rem',
  borderRadius: '999px',
  border: '1px solid rgba(248, 250, 252, 0.14)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#e2e8f0',
  fontSize: '0.68rem',
  lineHeight: 1,
};

const MAP_CONTROL_BUTTON_STYLE: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(56, 189, 248, 0.18)',
  borderRadius: '8px',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#e2e8f0',
  padding: '0.5rem 0.7rem',
  fontSize: '0.72rem',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

type MapViewMode = 'zones' | 'heatmap';
type HeatWeightMode = 'density' | 'risk';

const EMPTY_CV_ZONES: CVZoneMetric[] = [];
const EMPTY_RISK_ZONES: RiskZoneMetric[] = [];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function normalizedBoundsToSimpleCrsPolygon(
  bounds: NormalizedZoneBounds,
  dimensions: VenueMapDimensions
): SimpleCrsPoint[] {
  const xMin = clamp01(bounds.x_min) * dimensions.width;
  const xMax = clamp01(bounds.x_max) * dimensions.width;

  // Leaflet CRS.Simple uses a flipped Y axis compared with the usual image-space origin at top-left.
  const yTop = dimensions.height - clamp01(bounds.y_min) * dimensions.height;
  const yBottom = dimensions.height - clamp01(bounds.y_max) * dimensions.height;

  return [
    [yBottom, xMin],
    [yBottom, xMax],
    [yTop, xMax],
    [yTop, xMin],
  ];
}

function normalizedBoundsToSimpleCrsCentroid(
  bounds: NormalizedZoneBounds,
  dimensions: VenueMapDimensions
): SimpleCrsPoint {
  const centerX = clamp01((bounds.x_min + bounds.x_max) / 2) * dimensions.width;
  const centerY = dimensions.height - clamp01((bounds.y_min + bounds.y_max) / 2) * dimensions.height;
  return [centerY, centerX];
}

function getRiskLevelStyle(riskLevel?: string) {
  return RISK_LEVEL_STYLE[(riskLevel || '').toLowerCase()] ?? RISK_LEVEL_STYLE.low;
}

function MapFlyToZone({
  selectedZoneId,
  zoneConfigs,
  imageWidth,
  imageHeight,
}: {
  selectedZoneId?: string | null;
  zoneConfigs: ZoneConfig[];
  imageWidth: number;
  imageHeight: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedZoneId) return;
    const targetConfig = zoneConfigs.find((z) => z.zone_id.toLowerCase() === selectedZoneId.toLowerCase());
    if (targetConfig && targetConfig.bounds_normalized) {
      const centroid = normalizedBoundsToSimpleCrsCentroid(targetConfig.bounds_normalized, {
        width: imageWidth,
        height: imageHeight,
      });
      map.flyTo([centroid[0], centroid[1]], 0, { duration: 1.2 });
    }
  }, [selectedZoneId, zoneConfigs, imageWidth, imageHeight, map]);

  return null;
}

function HeatmapLayer({
  points,
  isActive,
}: {
  points: Array<[number, number, number]>;
  isActive: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!isActive || points.length === 0) {
      return;
    }

    const heatLayerFactory = (L as typeof L & {
      heatLayer: (latlngs: Array<[number, number, number] | L.LatLng>, options?: Record<string, unknown>) => L.Layer;
    }).heatLayer;

    const layer = heatLayerFactory(points, {
      radius: 42,
      blur: 32,
      maxZoom: 2,
      minOpacity: 0.2,
      gradient: {
        0.2: '#22c55e',
        0.45: '#eab308',
        0.7: '#f97316',
        1.0: '#ef4444',
      },
    });

    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [isActive, map, points]);

  return null;
}

function ZoneDetailsContent({
  zoneId,
  riskZone,
  cvZone,
}: {
  zoneId: string;
  riskZone?: RiskZoneMetric;
  cvZone?: CVZoneMetric;
}) {
  const flowDirectionDeg = cvZone?.avg_flow_direction_deg ?? 0;
  const anomalyFlags = cvZone?.anomaly_flags ?? [];
  const flowLabel = cvZone?.avg_flow_direction_label?.trim() || 'N/A';

  return (
    <div style={{ minWidth: '220px', maxWidth: '280px', color: '#e2e8f0' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
        {zoneId}
      </div>

      <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ color: '#94a3b8' }}>Crowd</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{cvZone?.crowd_count ?? 0}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ color: '#94a3b8' }}>Density</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(cvZone?.density_score ?? 0).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ color: '#94a3b8' }}>Risk</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(riskZone?.risk_score ?? 0).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8' }}>Flow</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            <span aria-hidden="true" style={{ ...FLOW_ARROW_STYLE, transform: `rotate(${flowDirectionDeg}deg)` }}>
              ▲
            </span>
            <span>{flowLabel}</span>
          </span>
        </div>
      </div>

      <div style={{ marginTop: '0.7rem' }}>
        <div
          style={{
            fontSize: '0.68rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginBottom: '0.35rem',
          }}
        >
          Anomalies
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {anomalyFlags.length > 0 ? (
            anomalyFlags.map((flag) => (
              <span key={flag} style={BADGE_STYLE}>
                <span aria-hidden="true" style={{ color: '#f59e0b', fontSize: '0.78rem', lineHeight: 1 }}>
                  ⚠
                </span>
                {flag}
              </span>
            ))
          ) : (
            <span style={{ ...BADGE_STYLE, color: '#94a3b8' }}>None active</span>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveVenueMapControls({
  viewMode,
  heatWeightMode,
  onToggleViewMode,
  onToggleWeightMode,
}: {
  viewMode: MapViewMode;
  heatWeightMode: HeatWeightMode;
  onToggleViewMode: () => void;
  onToggleWeightMode: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 500,
        width: '184px',
        padding: '0.7rem',
        borderRadius: '12px',
        border: '1px solid rgba(56, 189, 248, 0.22)',
        background: 'rgba(9, 16, 29, 0.92)',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#cbd5e1',
          marginBottom: '0.5rem',
        }}
      >
        Layer Mode
      </div>
      <button type="button" onClick={onToggleViewMode} style={MAP_CONTROL_BUTTON_STYLE}>
        {viewMode === 'zones' ? 'Zone View' : 'Heatmap View'}
      </button>
      <button
        type="button"
        onClick={onToggleWeightMode}
        style={{
          ...MAP_CONTROL_BUTTON_STYLE,
          marginTop: '0.5rem',
          opacity: viewMode === 'heatmap' ? 1 : 0.75,
        }}
      >
        Heat by {heatWeightMode === 'density' ? 'Density' : 'Risk'}
      </button>
      <div style={{ marginTop: '0.55rem', fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.4 }}>
        Switch the map between polygon zones and a weighted heatmap overlay.
      </div>
    </div>
  );
}

function createPlaceholderFloorPlanSvg(width: number, height: number): string {
  const majorStep = Math.max(100, Math.round(Math.min(width, height) / 6));
  const minorStep = Math.max(40, Math.round(majorStep / 2));

  const gridLines: string[] = [];
  for (let x = 0; x <= width; x += minorStep) {
    const isMajor = x % majorStep === 0;
    gridLines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${isMajor ? 'rgba(56, 189, 248, 0.22)' : 'rgba(148, 163, 184, 0.14)'}" stroke-width="${isMajor ? 2 : 1}" />`
    );
  }
  for (let y = 0; y <= height; y += minorStep) {
    const isMajor = y % majorStep === 0;
    gridLines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${isMajor ? 'rgba(56, 189, 248, 0.22)' : 'rgba(148, 163, 184, 0.14)'}" stroke-width="${isMajor ? 2 : 1}" />`
    );
  }

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0b1220" />
          <stop offset="100%" stop-color="#111c33" />
        </linearGradient>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill="rgba(148, 163, 184, 0.22)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <rect width="100%" height="100%" fill="url(#dots)" opacity="0.8" />
      ${gridLines.join('')}
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="12" ry="12" fill="none" stroke="rgba(248, 250, 252, 0.4)" stroke-width="3" stroke-dasharray="14 10" />
      <rect x="${Math.round(width * 0.18)}" y="${Math.round(height * 0.16)}" width="${Math.round(width * 0.64)}" height="${Math.round(height * 0.62)}" rx="20" ry="20" fill="rgba(6, 182, 212, 0.05)" stroke="rgba(56, 189, 248, 0.5)" stroke-width="2" />
      <text x="50%" y="48%" fill="#e2e8f0" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" text-anchor="middle">Venue Floor Plan Placeholder</text>
      <text x="50%" y="53%" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="16" text-anchor="middle">Replace this SVG with the real venue floor plan image for the demo</text>
    </svg>
  `)}`;
}

export const LiveVenueMap: React.FC<LiveVenueMapProps> = ({
  imageUrl,
  imageWidth = DEFAULT_IMAGE_WIDTH,
  imageHeight = DEFAULT_IMAGE_HEIGHT,
  isLiveFeedReady = false,
  selectedZoneId,
  className,
  style,
}) => {
  const [zoneConfigs, setZoneConfigs] = useState<ZoneConfig[]>([]);
  const latestFrame = useLiveDataStore((state) => state.latestFrame);
  const [viewMode, setViewMode] = useState<MapViewMode>('zones');
  const [heatWeightMode, setHeatWeightMode] = useState<HeatWeightMode>('density');

  const liveRiskZones = latestFrame?.risk_data?.zones ?? EMPTY_RISK_ZONES;
  const liveCvZones = latestFrame?.cv_data?.zones ?? EMPTY_CV_ZONES;

  useEffect(() => {
    let isMounted = true;

    const loadZones = async () => {
      try {
        const zones = await getZones();
        if (isMounted) {
          setZoneConfigs(zones);
        }
      } catch (error) {
        console.error('[LiveVenueMap] Failed to load zone configs:', error);
      }
    };

    loadZones();

    return () => {
      isMounted = false;
    };
  }, []);

  const riskByZoneId = useMemo(() => {
    return new Map<string, RiskZoneMetric>(liveRiskZones.map((zone) => [zone.zone_id, zone]));
  }, [liveRiskZones]);

  const cvByZoneId = useMemo(() => {
    return new Map<string, CVZoneMetric>(liveCvZones.map((zone) => [zone.zone_id, zone]));
  }, [liveCvZones]);

  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [imageHeight, imageWidth],
  ];
  const overlayUrl = imageUrl ?? createPlaceholderFloorPlanSvg(imageWidth, imageHeight);
  const visibleZoneConfigs = zoneConfigs.filter((zoneConfig) => riskByZoneId.has(zoneConfig.zone_id) || zoneConfigs.length > 0);

  const heatPoints = useMemo<Array<[number, number, number]>>(() => {
    return visibleZoneConfigs.flatMap((zoneConfig) => {
      const cvZone = cvByZoneId.get(zoneConfig.zone_id);
      const riskZone = riskByZoneId.get(zoneConfig.zone_id);
      if (!cvZone && !riskZone) {
        return [];
      }

      const centroid = normalizedBoundsToSimpleCrsCentroid(zoneConfig.bounds_normalized, {
        width: imageWidth,
        height: imageHeight,
      });
      const densityScore = Math.max(0, cvZone?.density_score ?? 0);
      const riskScore = Math.max(0, riskZone?.risk_score ?? 0);
      const weightBase = heatWeightMode === 'density' ? densityScore : riskScore;
      const normalizedWeight = Math.min(1, weightBase / (heatWeightMode === 'density' ? 5 : 100));

      return [[centroid[0], centroid[1], normalizedWeight]];
    });
  }, [cvByZoneId, heatWeightMode, imageHeight, imageWidth, riskByZoneId, visibleZoneConfigs]);

  const showZoneView = viewMode === 'zones';
  const showHeatmapView = viewMode === 'heatmap';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: '8px',
        border: '1px solid var(--border-panel)',
        background: '#09101d',
        ...style,
      }}
    >
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        style={{ height: '100%', width: '100%', background: '#09101d' }}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
        doubleClickZoom
        dragging
        touchZoom
        minZoom={-2}
      >
        <ImageOverlay url={overlayUrl} bounds={bounds} opacity={0.98} />

        <MapFlyToZone
          selectedZoneId={selectedZoneId}
          zoneConfigs={zoneConfigs}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
        />

        {showZoneView &&
          visibleZoneConfigs.map((zoneConfig) => {
            const riskZone = riskByZoneId.get(zoneConfig.zone_id);
            const isTarget = selectedZoneId && selectedZoneId.toLowerCase() === zoneConfig.zone_id.toLowerCase();
            const riskStyle = getRiskLevelStyle(riskZone?.risk_level);

            return (
              <Polygon
                key={zoneConfig.zone_id}
                interactive
                pathOptions={{
                  className: 'live-venue-zone',
                  color: isTarget ? '#38bdf8' : riskStyle.stroke,
                  weight: isTarget ? 4 : 2,
                  opacity: 0.95,
                  fillColor: isTarget ? '#06b6d4' : riskStyle.fill,
                  fillOpacity: isTarget ? 0.5 : 0.28,
                }}
                positions={normalizedBoundsToSimpleCrsPolygon(zoneConfig.bounds_normalized, {
                  width: imageWidth,
                  height: imageHeight,
                })}
                eventHandlers={{
                  click: (event) => {
                    event.target.openPopup();
                  },
                }}
                bubblingMouseEvents={false}
              >
                <Tooltip direction="top" sticky opacity={1} className="live-venue-tooltip">
                  <ZoneDetailsContent
                    zoneId={zoneConfig.zone_id}
                    riskZone={riskZone}
                    cvZone={cvByZoneId.get(zoneConfig.zone_id)}
                  />
                </Tooltip>
                <Popup autoPan={false} className="live-venue-popup">
                  <ZoneDetailsContent
                    zoneId={zoneConfig.zone_id}
                    riskZone={riskZone}
                    cvZone={cvByZoneId.get(zoneConfig.zone_id)}
                  />
                </Popup>
              </Polygon>
            );
          })}

        <HeatmapLayer points={heatPoints} isActive={showHeatmapView} />
      </MapContainer>

      <LiveVenueMapControls
        viewMode={viewMode}
        heatWeightMode={heatWeightMode}
        onToggleViewMode={() => setViewMode((current) => (current === 'zones' ? 'heatmap' : 'zones'))}
        onToggleWeightMode={() =>
          setHeatWeightMode((current) => (current === 'density' ? 'risk' : 'density'))
        }
      />

      {!isLiveFeedReady && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(5, 8, 17, 0.52), rgba(5, 8, 17, 0.78))',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              background: 'rgba(13, 19, 34, 0.85)',
              color: '#e2e8f0',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Live WebSocket Overwatch Active
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: '12px',
          bottom: '12px',
          zIndex: 450,
          padding: '0.65rem 0.75rem',
          borderRadius: '10px',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          background: 'rgba(9, 16, 29, 0.88)',
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
          pointerEvents: 'none',
          minWidth: '150px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#cbd5e1',
            marginBottom: '0.45rem',
          }}
        >
          Risk Legend
        </div>
        {[
          ['low', 'Low'],
          ['moderate', 'Moderate'],
          ['high', 'High'],
          ['critical', 'Critical'],
        ].map(([level, label]) => {
          const style = getRiskLevelStyle(level);
          return (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '999px',
                  backgroundColor: style.fill,
                  boxShadow: `0 0 0 1px ${style.stroke}55`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#e2e8f0' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LiveVenueMap;