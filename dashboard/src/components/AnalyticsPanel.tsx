import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { getZones, getTrends } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type { ZoneConfig, ZoneTrendPoint, ZoneHistoryPoint } from '../types/api';

interface ChartPoint {
  rawTimestamp: string | number;
  formattedTime: string;
  density_score: number;
  risk_score: number;
  risk_level: string;
}

const CRITICAL_THRESHOLD = 0.75;

// Risk Level Helper
const getRiskLevelColor = (riskScore: number): string => {
  if (riskScore >= CRITICAL_THRESHOLD) return '#ef4444'; // critical red
  if (riskScore >= 0.5) return '#f97316';               // high orange
  if (riskScore >= 0.25) return '#eab308';              // moderate yellow
  return '#22c55e';                                      // low green
};

const getRiskLevelLabel = (riskScore: number): string => {
  if (riskScore >= CRITICAL_THRESHOLD) return 'CRITICAL';
  if (riskScore >= 0.5) return 'HIGH';
  if (riskScore >= 0.25) return 'MODERATE';
  return 'LOW';
};

const formatTimeLabel = (ts: string | number): string => {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toTimeString().split(' ')[0];
  } catch {
    return String(ts);
  }
};

export const AnalyticsPanel: React.FC = () => {
  const [staticZones, setStaticZones] = useState<ZoneConfig[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<ZoneTrendPoint[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState<boolean>(true);
  const [isLoadingTrends, setIsLoadingTrends] = useState<boolean>(false);

  // Subscribe to live in-memory zoneHistory Map and latestFrame from zustand store
  const zoneHistory = useLiveDataStore((state) => state.zoneHistory);
  const latestFrame = useLiveDataStore((state) => state.latestFrame);

  // Combine static API zones with any dynamic zones discovered from live telemetry frames
  const allZones = useMemo<ZoneConfig[]>(() => {
    const zoneMap = new Map<string, ZoneConfig>();

    for (const z of staticZones) {
      zoneMap.set(z.zone_id, z);
    }

    // Add zones discovered in live zoneHistory
    for (const zId of zoneHistory.keys()) {
      if (!zoneMap.has(zId)) {
        zoneMap.set(zId, {
          zone_id: zId,
          venue_id: 'cam_01',
          bounds_normalized: { x_min: 0, y_min: 0, x_max: 1, y_max: 1 },
          max_expected_count: 50,
          adjacency: [],
        });
      }
    }

    // Add zones discovered in latest live frame
    const frameCvZones = latestFrame?.cv_data?.zones || [];
    for (const z of frameCvZones) {
      const zId = z.zone_id || (z as any).id;
      if (zId && !zoneMap.has(zId)) {
        zoneMap.set(zId, {
          zone_id: zId,
          venue_id: 'cam_01',
          bounds_normalized: z.bounds_normalized || { x_min: 0, y_min: 0, x_max: 1, y_max: 1 },
          max_expected_count: 50,
          adjacency: [],
        });
      }
    }

    return Array.from(zoneMap.values());
  }, [staticZones, zoneHistory, latestFrame]);

  // Load available zones on mount
  useEffect(() => {
    let isMounted = true;
    const fetchZoneList = async () => {
      try {
        setIsLoadingZones(true);
        const data = await getZones();
        if (isMounted && data && data.length > 0) {
          setStaticZones(data);
          setSelectedZoneId((prev) => prev || data[0].zone_id);
        }
      } catch (err) {
        console.error('[AnalyticsPanel] Failed to fetch zone list:', err);
      } finally {
        if (isMounted) setIsLoadingZones(false);
      }
    };

    fetchZoneList();
    return () => {
      isMounted = false;
    };
  }, []);

  // Ensure selectedZoneId defaults to first available zone if current is invalid
  useEffect(() => {
    if (!selectedZoneId && allZones.length > 0) {
      setSelectedZoneId(allZones[0].zone_id);
    }
  }, [selectedZoneId, allZones]);

  // Fetch historical trends when selectedZoneId changes
  const fetchHistoricalTrends = useCallback(async (zoneId: string) => {
    if (!zoneId) return;
    try {
      setIsLoadingTrends(true);
      const trends = await getTrends(zoneId);
      setHistoricalData(trends || []);
    } catch (err) {
      console.error(`[AnalyticsPanel] Failed to fetch trends for zone '${zoneId}':`, err);
      setHistoricalData([]);
    } finally {
      setIsLoadingTrends(false);
    }
  }, []);

  useEffect(() => {
    if (selectedZoneId) {
      fetchHistoricalTrends(selectedZoneId);
    }
  }, [selectedZoneId, fetchHistoricalTrends]);

  // Combine historical data + live in-memory zoneHistory points
  const combinedChartData = useMemo<ChartPoint[]>(() => {
    if (!selectedZoneId) return [];

    const livePoints: ZoneHistoryPoint[] = zoneHistory.get(selectedZoneId) || [];
    const points: ChartPoint[] = [];

    // 1. Add historical points
    if (historicalData && historicalData.length > 0) {
      for (const hPoint of historicalData) {
        points.push({
          rawTimestamp: hPoint.timestamp,
          formattedTime: formatTimeLabel(hPoint.timestamp),
          density_score: Number(hPoint.density_score || 0),
          risk_score: Number(hPoint.risk_score || 0),
          risk_level: hPoint.risk_level || getRiskLevelLabel(hPoint.risk_score || 0),
        });
      }
    }

    // 2. Append live in-memory streaming points
    for (let i = 0; i < livePoints.length; i++) {
      const lPoint = livePoints[i];
      points.push({
        rawTimestamp: lPoint.timestamp,
        formattedTime: formatTimeLabel(lPoint.timestamp),
        density_score: Number(lPoint.density_score || 0),
        risk_score: Number(lPoint.risk_score || 0),
        risk_level: getRiskLevelLabel(lPoint.risk_score || 0),
      });
    }

    // 3. If only 1 single point exists, synthesize an initial starting baseline so Recharts AreaChart draws properly
    if (points.length === 1) {
      const p = points[0];
      return [
        {
          rawTimestamp: p.rawTimestamp,
          formattedTime: p.formattedTime,
          density_score: 0,
          risk_score: 0,
          risk_level: 'LOW',
        },
        p,
      ];
    }

    // Cap to most recent ~60 points for auto-scroll sparkline readability
    return points.slice(-60);
  }, [selectedZoneId, historicalData, zoneHistory]);

  const latestPoint = combinedChartData[combinedChartData.length - 1];
  const currentRiskScore = latestPoint?.risk_score ?? 0;
  const currentDensity = latestPoint?.density_score ?? 0;
  const currentRiskColor = getRiskLevelColor(currentRiskScore);
  const currentRiskLabel = getRiskLevelLabel(currentRiskScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', gap: '0.75rem' }}>
      {/* Selector & Telemetry Summary Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--border-panel)',
        }}
      >
        {/* Zone Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Target Zone:
          </label>
          <select
            value={selectedZoneId}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            disabled={isLoadingZones && allZones.length === 0}
            style={{
              backgroundColor: '#090d16',
              color: '#f8fafc',
              border: '1px solid var(--border-panel)',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {isLoadingZones && allZones.length === 0 ? (
              <option value="">Loading zones...</option>
            ) : allZones.length === 0 ? (
              <option value="">No zones configured</option>
            ) : (
              allZones.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.zone_id} (Max: {z.max_expected_count})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Selected Zone Telemetry Badges */}
        {selectedZoneId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="font-mono">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>Density:</span>
              <span style={{ fontWeight: 700, color: 'var(--color-accent-blue)' }}>
                {currentDensity.toFixed(2)} p/m²
              </span>
            </div>

            <div style={{ height: '14px', width: '1px', backgroundColor: 'var(--border-panel)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>Risk:</span>
              <span style={{ fontWeight: 700, color: currentRiskColor }}>
                {(currentRiskScore * 100).toFixed(0)}%
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                  backgroundColor: `${currentRiskColor}22`,
                  color: currentRiskColor,
                  border: `1px solid ${currentRiskColor}55`,
                }}
              >
                {currentRiskLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Viewport */}
      {isLoadingTrends && combinedChartData.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          Fetching zone trend analytics...
        </div>
      ) : combinedChartData.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
          No trend data recorded for selected zone yet. Feed a video to stream live metrics.
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
          {/* Chart A: Density Score AreaChart */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(5, 8, 17, 0.5)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-panel)' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent-cyan)', marginBottom: '0.25rem', letterSpacing: '0.05em', textTransform: 'uppercase' }} className="font-mono">
              Crowd Density Score (p/m²)
            </div>
            <div style={{ flex: 1, minHeight: '130px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combinedChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="densityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={9} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={{ stroke: '#1e293b' }} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0d1322', borderColor: 'var(--border-panel-bright)', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }}
                    formatter={(val: any) => [typeof val === 'number' ? val.toFixed(2) : val, 'Density Score']}
                  />
                  <Area
                    type="monotone"
                    dataKey="density_score"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#densityGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart B: Risk Score LineChart with Critical Threshold Reference Line */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(5, 8, 17, 0.5)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-status-connecting)', letterSpacing: '0.05em', textTransform: 'uppercase' }} className="font-mono">
                Zone Risk Index (0.0 - 1.0)
              </div>
              <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }} className="font-mono">
                CRITICAL THRESHOLD: 0.75
              </div>
            </div>
            <div style={{ flex: 1, minHeight: '130px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combinedChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={currentRiskColor} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={currentRiskColor} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={9} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={{ stroke: '#1e293b' }} domain={[0, 1.0]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0d1322', borderColor: 'var(--border-panel-bright)', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }}
                    formatter={(val: any) => [typeof val === 'number' ? (val * 100).toFixed(1) + '%' : val, 'Risk Score']}
                  />
                  <ReferenceLine
                    y={CRITICAL_THRESHOLD}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: 'Critical Threshold (0.75)',
                      fill: '#ef4444',
                      fontSize: 9,
                      position: 'insideTopRight',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="risk_score"
                    stroke={currentRiskColor}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#riskGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPanel;
