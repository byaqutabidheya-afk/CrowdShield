import { useEffect, useState, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, ImageOverlay, Polygon, CircleMarker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import { DEMO_CALIBRATION, latLngToNormalized } from '../services/geofencing';
import { getBackendHttpUrl } from '../services/apiConfig';

const DEFAULT_IMAGE_WIDTH = 1600;
const DEFAULT_IMAGE_HEIGHT = 900;

const RISK_LEVEL_STYLE: Record<string, { fill: string; stroke: string }> = {
  low: { fill: '#22c55e', stroke: '#16a34a' },
  moderate: { fill: '#eab308', stroke: '#ca8a04' },
  high: { fill: '#f97316', stroke: '#ea580c' },
  critical: { fill: '#ef4444', stroke: '#dc2626' },
};

function getRiskLevelStyle(riskLevel?: string) {
  return RISK_LEVEL_STYLE[(riskLevel || '').toLowerCase()] ?? RISK_LEVEL_STYLE.low;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function normalizedBoundsToSimpleCrsPolygon(
  bounds: any,
  dimensions: { width: number; height: number }
): [number, number][] {
  const xMin = clamp01(bounds.x_min) * dimensions.width;
  const xMax = clamp01(bounds.x_max) * dimensions.width;

  // Leaflet CRS.Simple uses a flipped Y axis compared with image-space origin at top-left.
  const yTop = dimensions.height - clamp01(bounds.y_min) * dimensions.height;
  const yBottom = dimensions.height - clamp01(bounds.y_max) * dimensions.height;

  return [
    [yBottom, xMin],
    [yBottom, xMax],
    [yTop, xMax],
    [yTop, xMin],
  ];
}

function MapViewportController() {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
    const t3 = setTimeout(() => map.invalidateSize(), 800);

    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    const onZoom = () => {
      map.invalidateSize();
    };
    map.on('zoomend', onZoom);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      resizeObserver.disconnect();
      map.off('zoomend', onZoom);
    };
  }, [map]);

  return null;
}

function createPlaceholderFloorPlanSvg(width: number, height: number): string {
  const majorStep = Math.max(100, Math.round(Math.min(width, height) / 6));
  const minorStep = Math.max(40, Math.round(majorStep / 2));

  const gridLines: string[] = [];
  for (let x = 0; x <= width; x += minorStep) {
    const isMajor = x % majorStep === 0;
    gridLines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${isMajor ? 'rgba(167, 139, 250, 0.22)' : 'rgba(148, 163, 184, 0.14)'}" stroke-width="${isMajor ? 2 : 1}" />`
    );
  }
  for (let y = 0; y <= height; y += minorStep) {
    const isMajor = y % majorStep === 0;
    gridLines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${isMajor ? 'rgba(167, 139, 250, 0.22)' : 'rgba(148, 163, 184, 0.14)'}" stroke-width="${isMajor ? 2 : 1}" />`
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
      <rect x="${Math.round(width * 0.18)}" y="${Math.round(height * 0.16)}" width="${Math.round(width * 0.64)}" height="${Math.round(height * 0.62)}" rx="20" ry="20" fill="rgba(139, 92, 246, 0.05)" stroke="rgba(167, 139, 250, 0.5)" stroke-width="2" />
      <text x="50%" y="48%" fill="#e2e8f0" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="28" font-weight="700" text-anchor="middle">Venue Floor Plan Placeholder</text>
      <text x="50%" y="53%" fill="#94a3b8" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="16" text-anchor="middle">Replace this SVG with the real venue floor plan image for the demo</text>
    </svg>
  `)}`;
}

export default function SafeMapScreen() {
  const { selectedLanguage, activeZoneRisks, userLocation } = useAppStore();
  const [zones, setZones] = useState<any[]>([]);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [routingBanner, setRoutingBanner] = useState<string | null>(null);
  const [isAccessibleRoute, setIsAccessibleRoute] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchZones = async () => {
      try {
        const url = getBackendHttpUrl();
        const res = await axios.get(`${url}/zones`);
        if (isMounted && res.data && res.data.length > 0) {
          // Ensure at least zone_B2 and zone_A2 are marked as exits if missing
          const enriched = res.data.map((z: any) => {
            if (z.is_exit != null) return z;
            return {
              ...z,
              is_exit: z.zone_id === 'zone_B2' || z.zone_id === 'zone_A2' || z.zone_id.toLowerCase().includes('exit')
            };
          });
          setZones(enriched);
        } else if (isMounted) {
          setZones([
            { zone_id: 'zone_A1', bounds_normalized: { x_min: 0, y_min: 0, x_max: 0.5, y_max: 0.5 }, is_exit: false },
            { zone_id: 'zone_A2', bounds_normalized: { x_min: 0.5, y_min: 0, x_max: 1.0, y_max: 0.5 }, is_exit: true },
            { zone_id: 'zone_B1', bounds_normalized: { x_min: 0, y_min: 0.5, x_max: 0.5, y_max: 1.0 }, is_exit: false },
            { zone_id: 'zone_B2', bounds_normalized: { x_min: 0.5, y_min: 0.5, x_max: 1.0, y_max: 1.0 }, is_exit: true },
          ]);
        }
      } catch (e) {
        console.error('Failed to fetch zones, using fallback defaults', e);
        if (isMounted) {
          setZones([
            { zone_id: 'zone_A1', bounds_normalized: { x_min: 0, y_min: 0, x_max: 0.5, y_max: 0.5 }, is_exit: false },
            { zone_id: 'zone_A2', bounds_normalized: { x_min: 0.5, y_min: 0, x_max: 1.0, y_max: 0.5 }, is_exit: true },
            { zone_id: 'zone_B1', bounds_normalized: { x_min: 0, y_min: 0.5, x_max: 0.5, y_max: 1.0 }, is_exit: false },
            { zone_id: 'zone_B2', bounds_normalized: { x_min: 0.5, y_min: 0.5, x_max: 1.0, y_max: 1.0 }, is_exit: true },
          ]);
        }
      }
    };
    fetchZones();
    return () => { isMounted = false; };
  }, []);

  const targetExitIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userLocation || zones.length === 0) return;

    const computeRoute = async () => {
      // Find exits: check is_exit flag, 'exit' keyword, or designated exit perimeter zones
      let exits = zones.filter(z => z.is_exit || z.zone_id.toLowerCase().includes('exit'));
      if (exits.length === 0) {
        exits = zones.filter(z => z.zone_id === 'zone_B2' || z.zone_id === 'zone_B1' || z.zone_id === 'zone_A2');
      }
      if (exits.length === 0) {
        exits = zones.length > 0 ? [zones[zones.length - 1]] : [];
      }
      if (exits.length === 0) return;

      const getRealWorldLatLng = (normBox: any) => {
        const crsX = clamp01((normBox.x_min + normBox.x_max) / 2);
        const crsY = clamp01((normBox.y_min + normBox.y_max) / 2);
        const lat = DEMO_CALIBRATION.topLeftLatLng.lat + crsY * (DEMO_CALIBRATION.bottomRightLatLng.lat - DEMO_CALIBRATION.topLeftLatLng.lat);
        const lng = DEMO_CALIBRATION.topLeftLatLng.lng + crsX * (DEMO_CALIBRATION.bottomRightLatLng.lng - DEMO_CALIBRATION.topLeftLatLng.lng);
        return { lat, lng };
      };

      const exitsWithDist = exits.map(exit => {
        const { lat, lng } = getRealWorldLatLng(exit.bounds_normalized);
        const distance = Math.hypot(userLocation.lat - lat, userLocation.lng - lng);
        return { ...exit, lat, lng, distance };
      }).sort((a, b) => a.distance - b.distance);

      // Exit selection with hysteresis to prevent route flipping
      let targetExit = exitsWithDist[0];
      if (targetExitIdRef.current) {
        const currentActive = exitsWithDist.find(e => e.zone_id === targetExitIdRef.current);
        // Only switch if the new exit is noticeably closer (>20% closer)
        if (currentActive && currentActive.distance < targetExit.distance * 1.2) {
          targetExit = currentActive;
        } else {
          targetExitIdRef.current = targetExit.zone_id;
        }
      } else {
        targetExitIdRef.current = targetExit.zone_id;
      }

      // 1. Fetch GET /api/routes for route blockage predictions before computing
      try {
        const url = getBackendHttpUrl();
        const res = await axios.get(`${url}/routes`);
        const blockages = res.data;
        const nearestExitBlockage = Array.isArray(blockages) ? blockages.find((b: any) => b.route_id === targetExit.zone_id) : null;

        if (nearestExitBlockage?.at_risk_of_blockage) {
          setRoutingBanner(`Nearest exit route may be blocked near ${nearestExitBlockage.blocking_zone_id} — rerouting`);
          const safeExit = exitsWithDist.find(e => {
            const b = Array.isArray(blockages) ? blockages.find((blk: any) => blk.route_id === e.zone_id) : null;
            return !b?.at_risk_of_blockage;
          });
          if (safeExit) {
            targetExit = safeExit;
            targetExitIdRef.current = targetExit.zone_id;
          }
        } else {
          setRoutingBanner(null);
        }
      } catch (e) {
        // Fallback silently if /api/routes is missing
      }

      // 2. Compute smooth path from user location to target exit
      const allWaypoints: { lat: number; lng: number }[] = [
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat: targetExit.lat, lng: targetExit.lng }
      ];

      const mappedCoords = allWaypoints.map((wp) => {
        const norm = latLngToNormalized({ lat: wp.lat, lng: wp.lng }, DEMO_CALIBRATION);
        const crsX = clamp01(norm.x) * DEFAULT_IMAGE_WIDTH;
        const crsY = DEFAULT_IMAGE_HEIGHT - clamp01(norm.y) * DEFAULT_IMAGE_HEIGHT;
        return [crsY, crsX] as [number, number];
      });

      setRoutePolyline(mappedCoords);
    };

    computeRoute();
  }, [userLocation, zones, activeZoneRisks, isAccessibleRoute]);

  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [DEFAULT_IMAGE_HEIGHT, DEFAULT_IMAGE_WIDTH],
  ];
  const overlayUrl = createPlaceholderFloorPlanSvg(DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);

  const customSvgRenderer = useMemo(() => L.svg({ padding: 2.0 }), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '16px' }}>
      <h1 style={{ margin: '0 0 1rem 0' }}>{getTranslation(selectedLanguage, 'safeMap')}</h1>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
        <button
          onClick={() => setIsAccessibleRoute(false)}
          style={{
            flex: 1,
            padding: '10px 8px',
            backgroundColor: !isAccessibleRoute ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
            color: !isAccessibleRoute ? 'white' : 'var(--text-secondary)',
            border: `1px solid ${!isAccessibleRoute ? 'var(--primary-color)' : 'var(--border-color)'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          Standard Route
        </button>
        <button
          onClick={() => setIsAccessibleRoute(true)}
          style={{
            flex: 1,
            padding: '10px 8px',
            backgroundColor: isAccessibleRoute ? '#3b82f6' : 'rgba(255,255,255,0.05)',
            color: isAccessibleRoute ? 'white' : 'var(--text-secondary)',
            border: `1px solid ${isAccessibleRoute ? '#3b82f6' : 'var(--border-color)'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>♿</span>
          {getTranslation(selectedLanguage, 'wheelchairAccessibleRoute')}
        </button>
      </div>

      {routingBanner && (
        <div style={{
          backgroundColor: 'var(--warning-color)',
          color: 'black',
          padding: '8px 12px',
          borderRadius: '6px',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span>
          {routingBanner}
        </div>
      )}

      <div style={{
        position: 'relative',
        flex: 1,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        background: '#09101d', // matches dashboard background perfectly
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        minHeight: '340px'
      }}>
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

          <MapViewportController />

          {zones.map((zoneConfig) => {
            const riskZone = activeZoneRisks.find((r) => r.zone_id === zoneConfig.zone_id);
            const riskStyle = getRiskLevelStyle(riskZone?.risk_level);

            return (
              <Polygon
                key={zoneConfig.zone_id}
                interactive={false}
                renderer={customSvgRenderer}
                pathOptions={{
                  className: 'citizen-pwa-zone',
                  color: riskStyle.stroke,
                  weight: 2,
                  opacity: 0.95,
                  fillColor: riskStyle.fill,
                  fillOpacity: 0.28,
                }}
                positions={normalizedBoundsToSimpleCrsPolygon(zoneConfig.bounds_normalized, {
                  width: DEFAULT_IMAGE_WIDTH,
                  height: DEFAULT_IMAGE_HEIGHT,
                })}
              />
            );
          })}

          {/* Render Exit Gates */}
          {zones.filter(z => z.is_exit).map(exitZone => {
            const crsX = ((exitZone.bounds_normalized.x_min + exitZone.bounds_normalized.x_max) / 2) * DEFAULT_IMAGE_WIDTH;
            const crsY = DEFAULT_IMAGE_HEIGHT - ((exitZone.bounds_normalized.y_min + exitZone.bounds_normalized.y_max) / 2) * DEFAULT_IMAGE_HEIGHT;
            return (
              <CircleMarker
                key={`exit-${exitZone.zone_id}`}
                center={[crsY, crsX]}
                radius={10}
                renderer={customSvgRenderer}
                pathOptions={{
                  color: '#15803d',
                  weight: 3,
                  fillColor: '#22c55e',
                  fillOpacity: 0.9,
                }}
              />
            );
          })}

          {routePolyline.length > 0 && (
            <>
              {/* Outer glow line */}
              <Polyline 
                positions={routePolyline} 
                renderer={customSvgRenderer}
                pathOptions={{
                  color: '#60a5fa',
                  weight: 10,
                  opacity: 0.4,
                }} 
              />
              {/* Main dashed navigation line */}
              <Polyline 
                positions={routePolyline} 
                renderer={customSvgRenderer}
                pathOptions={{
                  color: '#2563eb',
                  weight: 5,
                  opacity: 1,
                  dashArray: '8, 8'
                }} 
              />
            </>
          )}

          {userLocation && (() => {
            const normalized = latLngToNormalized(userLocation, DEMO_CALIBRATION);
            const crsX = clamp01(normalized.x) * DEFAULT_IMAGE_WIDTH;
            const crsY = DEFAULT_IMAGE_HEIGHT - clamp01(normalized.y) * DEFAULT_IMAGE_HEIGHT;
            
            return (
              <>
                {/* Outer pulse */}
                <CircleMarker 
                  center={[crsY, crsX]} 
                  radius={14}
                  renderer={customSvgRenderer}
                  pathOptions={{
                    color: '#3b82f6',
                    weight: 1,
                    fillColor: '#93c5fd',
                    fillOpacity: 0.4
                  }}
                />
                {/* Inner dot */}
                <CircleMarker 
                  center={[crsY, crsX]} 
                  radius={7}
                  renderer={customSvgRenderer}
                  pathOptions={{
                    color: 'white',
                    weight: 2.5,
                    fillColor: '#1d4ed8',
                    fillOpacity: 1
                  }}
                />
              </>
            );
          })()}
        </MapContainer>

        <div
          style={{
            position: 'absolute',
            left: '12px',
            bottom: '12px',
            zIndex: 450,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'rgba(9, 16, 29, 0.88)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
            minWidth: '105px',
          }}
        >
          <div
            style={{
              fontSize: '0.62rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#94a3b8',
              marginBottom: '6px',
              fontWeight: 700
            }}
          >
            Legend
          </div>
          {[
            ['low', 'Low Risk'],
            ['moderate', 'Moderate'],
            ['high', 'High Risk'],
            ['critical', 'Critical'],
          ].map(([level, label]) => {
            const style = getRiskLevelStyle(level);
            return (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: style.fill,
                    border: `1px solid ${style.stroke}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.7rem', color: '#f1f5f9', fontWeight: 600 }}>{label}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span
              aria-hidden="true"
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                border: '1px solid #15803d',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.7rem', color: '#86efac', fontWeight: 600 }}>Safe Exit</span>
          </div>
        </div>

        {zones.length === 0 && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(9, 16, 29, 0.75)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            color: 'white',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,0,0,0.5)',
              padding: '12px 20px',
              borderRadius: '30px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <span>↻</span> Waiting for live feed...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
