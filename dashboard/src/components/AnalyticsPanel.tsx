import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
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
  const [zones, setZones] = useState<ZoneConfig[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<ZoneTrendPoint[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState<boolean>(true);
  const [isLoadingTrends, setIsLoadingTrends] = useState<boolean>(false);

  // Subscribe to live in-memory zoneHistory Map from zustand store
  const zoneHistory = useLiveDataStore((state) => state.zoneHistory);

  // Load available zones on mount
  useEffect(() => {
    let isMounted = true;
    const fetchZoneList = async () => {
      try {
        setIsLoadingZones(true);
        const data = await getZones();
        if (isMounted && data && data.length > 0) {
          setZones(data);
          setSelectedZoneId(data[0].zone_id);
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

  // Fetch historical trends when selectedZoneId changes
  const fetchHistoricalTrends = useCallback(async (zoneId: string) => {
    if (!zoneId) return;
    try {
      setIsLoadingTrends(true);
      const trends = await getTrends(zoneId);
      setHistoricalData(trends);
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

  // Combine historical data + live WebSocket zoneHistory points (deduplicated by timestamp)
  const combinedChartData = useMemo<ChartPoint[]>(() => {
    if (!selectedZoneId) return [];

    const livePoints: ZoneHistoryPoint[] = zoneHistory.get(selectedZoneId) || [];

    const pointMap = new Map<string, ChartPoint>();

    // Add historical points first
    for (const hPoint of historicalData) {
      const ts = hPoint.timestamp;
      pointMap.set(String(ts), {
        rawTimestamp: ts,
        formattedTime: formatTimeLabel(ts),
        density_score: hPoint.density_score,
        risk_score: hPoint.risk_score,
        risk_level: hPoint.risk_level || getRiskLevelLabel(hPoint.risk_score),
      });
    }

    // Overlay live in-memory points
    for (const lPoint of livePoints) {
      const ts = lPoint.timestamp;
      pointMap.set(String(ts), {
        rawTimestamp: ts,
        formattedTime: formatTimeLabel(ts),
        density_score: lPoint.density_score,
        risk_score: lPoint.risk_score,
        risk_level: getRiskLevelLabel(lPoint.risk_score),
      });
    }

    // Sort by timestamp
    const allPoints = Array.from(pointMap.values()).sort((a, b) => {
      const timeA = new Date(a.rawTimestamp).getTime();
      const timeB = new Date(b.rawTimestamp).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) return timeA - timeB;
      return 0;
    });

    // Cap to most recent ~50 points for auto-scroll sparkline readability
    return allPoints.slice(-50);
  }, [selectedZoneId, historicalData, zoneHistory]);

  const latestPoint = combinedChartData[combinedChartData.length - 1];
  const currentRiskScore = latestPoint?.risk_score ?? 0;
  const currentDensity = latestPoint?.density_score ?? 0;
  const currentRiskColor = getRiskLevelColor(currentRiskScore);
  const currentRiskLabel = getRiskLevelLabel(currentRiskScore);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
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
            disabled={isLoadingZones}
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
            {isLoadingZones ? (
              <option value="">Loading zones...</option>
            ) : zones.length === 0 ? (
              <option value="">No zones configured</option>
            ) : (
              zones.map((z) => (
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
          No trend data recorded for selected zone yet.
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
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
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
                    stroke="#06b6d4"
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
                <LineChart data={combinedChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
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
                  <Line
                    type="monotone"
                    dataKey="risk_score"
                    stroke={currentRiskColor}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPanel;
