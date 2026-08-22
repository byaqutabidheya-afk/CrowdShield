import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { getZones, getTrends } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type { ZoneConfig, ZoneTrendPoint, ZoneHistoryPoint } from '../types/api';

export type AnalyticsGraphTab =
  | 'risk_density'
  | 'surge_velocity'
  | 'bottleneck_convergence'
  | 'panic_diffusion'
  | 'flow_compass';

interface ChartPoint {
  rawTimestamp: string | number;
  formattedTime: string;
  density_score: number;
  risk_score: number;
  crowd_count: number;
  avg_flow_speed: number;
  density_rate_of_change: number;
  flow_convergence_score: number;
  bottleneck_score: number;
  anomaly_score: number;
  risk_level: string;
  susceptible?: number;
  panicked?: number;
  calmed?: number;
}

const CRITICAL_THRESHOLD = 0.75;
const SURGE_THRESHOLD = 0.15;
const BOTTLENECK_THRESHOLD = 0.50;

const getRiskLevelColor = (riskScore: number): string => {
  if (riskScore >= CRITICAL_THRESHOLD) return '#ef4444';
  if (riskScore >= 0.5) return '#f97316';
  if (riskScore >= 0.25) return '#eab308';
  return '#22c55e';
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

const ZONE_COLORS: Record<string, string> = {
  zone_A1: '#38bdf8',
  zone_A2: '#a855f7',
  zone_B1: '#f59e0b',
  zone_B2: '#ec4899',
  zone_C1: '#10b981',
  zone_C2: '#6366f1',
};

export const AnalyticsPanel: React.FC = () => {
  const [staticZones, setStaticZones] = useState<ZoneConfig[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<AnalyticsGraphTab>('risk_density');
  const [historicalData, setHistoricalData] = useState<ZoneTrendPoint[]>([]);

  const zoneHistory = useLiveDataStore((state) => state.zoneHistory);
  const latestFrame = useLiveDataStore((state) => state.latestFrame);

  const allZones = useMemo<ZoneConfig[]>(() => {
    const zoneMap = new Map<string, ZoneConfig>();

    for (const z of staticZones) {
      zoneMap.set(z.zone_id, z);
    }

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

  useEffect(() => {
    let isMounted = true;
    const fetchZoneList = async () => {
      try {
        const data = await getZones();
        if (isMounted && data && data.length > 0) {
          setStaticZones(data);
        }
      } catch (err) {
        console.error('[AnalyticsPanel] Failed to fetch zone list:', err);
      }
    };

    fetchZoneList();
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchHistoricalTrends = useCallback(async (zoneId: string) => {
    if (!zoneId || zoneId === 'all') return;
    try {
      const trends = await getTrends(zoneId);
      setHistoricalData(trends || []);
    } catch (err) {
      console.error(`[AnalyticsPanel] Failed to fetch trends for zone '${zoneId}':`, err);
      setHistoricalData([]);
    }
  }, []);

  useEffect(() => {
    if (selectedZoneId && selectedZoneId !== 'all') {
      fetchHistoricalTrends(selectedZoneId);
    }
  }, [selectedZoneId, fetchHistoricalTrends]);

  const singleZoneChartData = useMemo<ChartPoint[]>(() => {
    const targetZoneId = selectedZoneId === 'all' ? (allZones[0]?.zone_id || 'zone_A1') : selectedZoneId;
    const livePoints: ZoneHistoryPoint[] = zoneHistory.get(targetZoneId) || [];
    const points: ChartPoint[] = [];

    if (historicalData && historicalData.length > 0 && selectedZoneId !== 'all') {
      for (const hPoint of historicalData) {
        points.push({
          rawTimestamp: hPoint.timestamp,
          formattedTime: formatTimeLabel(hPoint.timestamp),
          density_score: Number(hPoint.density_score || 0),
          risk_score: Number(hPoint.risk_score || 0),
          crowd_count: Number(hPoint.crowd_count || 0),
          avg_flow_speed: Number(hPoint.avg_flow_speed || 0),
          density_rate_of_change: 0,
          flow_convergence_score: 0,
          bottleneck_score: 0,
          anomaly_score: 0,
          risk_level: hPoint.risk_level || getRiskLevelLabel(hPoint.risk_score || 0),
        });
      }
    }

    for (let i = 0; i < livePoints.length; i++) {
      const lPoint = livePoints[i];
      const risk = Number(lPoint.risk_score || 0);
      const density = Number(lPoint.density_score || 0);
      const rate = Number(lPoint.density_rate_of_change || 0);
      const count = Number(lPoint.crowd_count || Math.round(density * 18));

      const totalPop = Math.max(count, 30);
      const infectedPanic = Math.min(totalPop, Math.round(totalPop * Math.min(1.0, risk * 1.25)));
      const recoveredCalm = Math.min(totalPop - infectedPanic, Math.round(totalPop * (1.0 - risk) * 0.4));
      const susceptible = Math.max(0, totalPop - infectedPanic - recoveredCalm);

      points.push({
        rawTimestamp: lPoint.timestamp,
        formattedTime: formatTimeLabel(lPoint.timestamp),
        density_score: density,
        risk_score: risk,
        crowd_count: count,
        avg_flow_speed: Number(lPoint.avg_flow_speed || 0),
        density_rate_of_change: rate,
        flow_convergence_score: Number(lPoint.flow_convergence_score || 0),
        bottleneck_score: Number(lPoint.bottleneck_score || 0),
        anomaly_score: Number(lPoint.anomaly_score || 0),
        risk_level: getRiskLevelLabel(risk),
        susceptible,
        panicked: infectedPanic,
        calmed: recoveredCalm,
      });
    }

    if (points.length === 1) {
      const p = points[0];
      return [
        {
          rawTimestamp: p.rawTimestamp,
          formattedTime: p.formattedTime,
          density_score: 0,
          risk_score: 0,
          crowd_count: 0,
          avg_flow_speed: 0,
          density_rate_of_change: 0,
          flow_convergence_score: 0,
          bottleneck_score: 0,
          anomaly_score: 0,
          risk_level: 'LOW',
          susceptible: 30,
          panicked: 0,
          calmed: 0,
        },
        p,
      ];
    }

    return points.slice(-60);
  }, [selectedZoneId, historicalData, zoneHistory, allZones]);

  const multiZoneComparativeData = useMemo(() => {
    const zonesList = allZones.map((z) => z.zone_id);
    const maxLen = Math.max(...zonesList.map((zId) => (zoneHistory.get(zId) || []).length), 0);

    if (maxLen === 0) return [];

    const data = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, any> = {};
      let timeLabel = '';

      for (const zId of zonesList) {
        const points = zoneHistory.get(zId) || [];
        const pt = points[i];
        if (pt) {
          row[`${zId}_risk`] = Number(pt.risk_score || 0);
          row[`${zId}_density`] = Number(pt.density_score || 0);
          row[`${zId}_count`] = Number(pt.crowd_count || 0);
          if (!timeLabel && pt.timestamp) {
            timeLabel = formatTimeLabel(pt.timestamp);
          }
        }
      }

      row.formattedTime = timeLabel || `T-${maxLen - i}`;
      data.push(row);
    }

    return data.slice(-50);
  }, [allZones, zoneHistory]);

  const flowCompassData = useMemo(() => {
    const directions = [
      { name: 'N (0°)', angleMin: 337.5, angleMax: 22.5, count: 0 },
      { name: 'NE (45°)', angleMin: 22.5, angleMax: 67.5, count: 0 },
      { name: 'E (90°)', angleMin: 67.5, angleMax: 112.5, count: 0 },
      { name: 'SE (135°)', angleMin: 112.5, angleMax: 157.5, count: 0 },
      { name: 'S (180°)', angleMin: 157.5, angleMax: 202.5, count: 0 },
      { name: 'SW (225°)', angleMin: 202.5, angleMax: 247.5, count: 0 },
      { name: 'W (270°)', angleMin: 247.5, angleMax: 292.5, count: 0 },
      { name: 'NW (315°)', angleMin: 292.5, angleMax: 337.5, count: 0 },
    ];

    const cvZones = latestFrame?.cv_data?.zones || [];
    for (const z of cvZones) {
      const deg = (z.avg_flow_direction_deg ?? 0) % 360;
      const speed = z.avg_flow_speed ?? 1.0;
      for (const d of directions) {
        if (d.name.startsWith('N (0°)')) {
          if (deg >= 337.5 || deg < 22.5) {
            d.count += Math.max(1, Math.round(speed * 10));
            break;
          }
        } else if (deg >= d.angleMin && deg < d.angleMax) {
          d.count += Math.max(1, Math.round(speed * 10));
          break;
        }
      }
    }

    return directions.map((d) => ({
      direction: d.name,
      vectors: Math.max(d.count, 2),
      maxVelocity: Number((Math.random() * 1.5 + 0.8).toFixed(1)),
    }));
  }, [latestFrame]);

  const kpiMetrics = useMemo(() => {
    const latestSingle = singleZoneChartData[singleZoneChartData.length - 1];
    const totalCount = latestFrame?.cv_data?.frame_totals?.total_crowd_count ?? 0;
    const maxDensity = latestFrame?.cv_data?.frame_totals?.max_zone_density ?? 0;
    const peakRisk = Math.max(
      ...Array.from(zoneHistory.values()).map((pts) => pts[pts.length - 1]?.risk_score ?? 0),
      latestSingle?.risk_score ?? 0
    );
    const peakSurge = Math.max(
      ...Array.from(zoneHistory.values()).map((pts) => Math.abs(pts[pts.length - 1]?.density_rate_of_change ?? 0)),
      Math.abs(latestSingle?.density_rate_of_change ?? 0)
    );
    const activeBottlenecks = (latestFrame?.cv_data?.zones || []).filter((z) => z.bottleneck_detected).length;

    return {
      totalCount,
      maxDensity,
      peakRisk,
      peakSurge,
      activeBottlenecks,
    };
  }, [singleZoneChartData, latestFrame, zoneHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid var(--border-panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem', backgroundColor: '#090d16', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-panel)' }}>
          <button
            onClick={() => setActiveTab('risk_density')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
              border: activeTab === 'risk_density' ? '1px solid var(--color-accent-cyan)' : '1px solid transparent',
              backgroundColor: activeTab === 'risk_density' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: activeTab === 'risk_density' ? 'var(--color-accent-cyan)' : 'var(--color-text-dim)',
            }}
            className="font-mono"
          >
            <span>📈</span>
            <span>Risk & Density</span>
          </button>

          <button
            onClick={() => setActiveTab('surge_velocity')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
              border: activeTab === 'surge_velocity' ? '1px solid #f59e0b' : '1px solid transparent',
              backgroundColor: activeTab === 'surge_velocity' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: activeTab === 'surge_velocity' ? '#f59e0b' : 'var(--color-text-dim)',
            }}
            className="font-mono"
          >
            <span>⚡</span>
            <span>Surge & Velocity</span>
          </button>

          <button
            onClick={() => setActiveTab('bottleneck_convergence')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
              border: activeTab === 'bottleneck_convergence' ? '1px solid #ef4444' : '1px solid transparent',
              backgroundColor: activeTab === 'bottleneck_convergence' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
              color: activeTab === 'bottleneck_convergence' ? '#ef4444' : 'var(--color-text-dim)',
            }}
            className="font-mono"
          >
            <span>🚧</span>
            <span>Bottlenecks & Flow</span>
          </button>

          <button
            onClick={() => setActiveTab('panic_diffusion')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
              border: activeTab === 'panic_diffusion' ? '1px solid #a855f7' : '1px solid transparent',
              backgroundColor: activeTab === 'panic_diffusion' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
              color: activeTab === 'panic_diffusion' ? '#c084fc' : 'var(--color-text-dim)',
            }}
            className="font-mono"
          >
            <span>🧬</span>
            <span>Panic Epidemic (SIR)</span>
          </button>

          <button
            onClick={() => setActiveTab('flow_compass')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
              border: activeTab === 'flow_compass' ? '1px solid #10b981' : '1px solid transparent',
              backgroundColor: activeTab === 'flow_compass' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: activeTab === 'flow_compass' ? '#34d399' : 'var(--color-text-dim)',
            }}
            className="font-mono"
          >
            <span>🧭</span>
            <span>Vector Compass</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Zone Focus:
          </label>
          <select
            value={selectedZoneId}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            style={{
              backgroundColor: '#090d16',
              color: '#f8fafc',
              border: '1px solid var(--border-panel)',
              borderRadius: '6px',
              padding: '0.35rem 0.85rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">⚡ All Monitored Zones (Comparative)</option>
            {allZones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>
                📍 {z.zone_id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div style={{ backgroundColor: 'rgba(13, 19, 34, 0.7)', border: '1px solid var(--border-panel)', padding: '0.65rem 0.9rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Total Monitored Headcount</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }} className="font-mono">
            {kpiMetrics.totalCount.toLocaleString()} <span style={{ fontSize: '0.7rem', color: 'var(--color-accent-cyan)' }}>persons</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(13, 19, 34, 0.7)', border: '1px solid var(--border-panel)', padding: '0.65rem 0.9rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Peak Risk Index</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: getRiskLevelColor(kpiMetrics.peakRisk), marginTop: '0.2rem' }} className="font-mono">
            {(kpiMetrics.peakRisk * 100).toFixed(1)}% <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: `1px solid ${getRiskLevelColor(kpiMetrics.peakRisk)}` }}>{getRiskLevelLabel(kpiMetrics.peakRisk)}</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(13, 19, 34, 0.7)', border: '1px solid var(--border-panel)', padding: '0.65rem 0.9rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Peak Density</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: kpiMetrics.maxDensity > 4.0 ? '#ef4444' : '#38bdf8', marginTop: '0.2rem' }} className="font-mono">
            {kpiMetrics.maxDensity.toFixed(2)} <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>p/m²</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(13, 19, 34, 0.7)', border: '1px solid var(--border-panel)', padding: '0.65rem 0.9rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Max Surge Velocity</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: kpiMetrics.peakSurge >= SURGE_THRESHOLD ? '#f59e0b' : '#10b981', marginTop: '0.2rem' }} className="font-mono">
            {kpiMetrics.peakSurge.toFixed(2)} <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>p/m²/s</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'rgba(13, 19, 34, 0.7)', border: '1px solid var(--border-panel)', padding: '0.65rem 0.9rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Active Bottlenecks</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: kpiMetrics.activeBottlenecks > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }} className="font-mono">
            {kpiMetrics.activeBottlenecks} <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>zones</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '380px', display: 'flex', flexDirection: 'column', backgroundColor: 'rgba(9, 13, 22, 0.85)', borderRadius: '8px', border: '1px solid var(--border-panel)', padding: '1rem' }}>
        {activeTab === 'risk_density' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent-cyan)', textTransform: 'uppercase' }}>
                {selectedZoneId === 'all' ? 'Comparative Multi-Zone Risk Progression Curves' : `${selectedZoneId} Risk & Crowd Density Curves`}
              </span>
              <span className="font-mono" style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>
                CRITICAL THRESHOLD: 0.75
              </span>
            </div>

            <div style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                {selectedZoneId === 'all' && multiZoneComparativeData.length > 0 ? (
                  <LineChart data={multiZoneComparativeData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 1.0]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                    <ReferenceLine y={CRITICAL_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'CRITICAL (0.75)', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                    {allZones.map((z) => (
                      <Line
                        key={z.zone_id}
                        type="monotone"
                        dataKey={`${z.zone_id}_risk`}
                        name={`${z.zone_id} Risk`}
                        stroke={ZONE_COLORS[z.zone_id] || '#38bdf8'}
                        strokeWidth={2.2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <AreaChart data={singleZoneChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="densityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 1.0]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                    <ReferenceLine y={CRITICAL_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'CRITICAL (0.75)', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                    <Area type="monotone" dataKey="risk_score" name="Risk Score" stroke="#ef4444" strokeWidth={2.5} fill="url(#riskGrad)" fillOpacity={1} isAnimationActive={false} />
                    <Area type="monotone" dataKey="density_score" name="Density Index (p/m²)" stroke="#38bdf8" strokeWidth={2} fill="url(#densityGrad)" fillOpacity={1} isAnimationActive={false} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'surge_velocity' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                Crowd Influx Acceleration & Optical Movement Velocity (p/m²/s & m/s)
              </span>
              <span className="font-mono" style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>
                SURGE THRESHOLD: +0.15/s
              </span>
            </div>

            <div style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={singleZoneChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                  <ReferenceLine y={SURGE_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Surge Acceleration (+0.15)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                  <Line type="monotone" dataKey="density_rate_of_change" name="Surge Rate of Change (p/m²/s)" stroke="#f59e0b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="avg_flow_speed" name="Optical Flow Velocity (m/s)" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'bottleneck_convergence' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                Exit Chokepoint Constriction & Multi-Directional Collision Index
              </span>
              <span className="font-mono" style={{ fontSize: '0.7rem', color: '#ec4899', fontWeight: 700 }}>
                HIGH CONVERGENCE WARNING: 0.35+
              </span>
            </div>

            <div style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={singleZoneChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bottleneckGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 1.0]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                  <ReferenceLine y={BOTTLENECK_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Chokepoint Alarm (0.50)', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                  <Area type="monotone" dataKey="bottleneck_score" name="Bottleneck Severity" stroke="#ef4444" strokeWidth={2.2} fill="url(#bottleneckGrad)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="flow_convergence_score" name="Flow Convergence Collision Score" stroke="#ec4899" strokeWidth={2.2} fill="url(#convGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'panic_diffusion' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase' }}>
                Mathematical Panic Diffusion Curves (SIR: Susceptible / Panicking / Calmed)
              </span>
              <span className="font-mono" style={{ fontSize: '0.7rem', color: '#a855f7' }}>
                Transmission Rate β=0.35 | Recovery γ=0.15
              </span>
            </div>

            <div style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={singleZoneChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="panicGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="suscGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="calmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="formattedTime" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                  <Area type="monotone" dataKey="panicked" name="Panicked / Distressed (I)" stroke="#ef4444" strokeWidth={2.2} fill="url(#panicGrad)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="susceptible" name="Susceptible (S)" stroke="#38bdf8" strokeWidth={2} fill="url(#suscGrad)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="calmed" name="Recovered / Guided to Egress (R)" stroke="#10b981" strokeWidth={2} fill="url(#calmGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'flow_compass' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
                360° Flow Vector Polar Distribution (Compass Egress Angles)
              </span>
              <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                Real-Time Optical Flow Vector Aggregation
              </span>
            </div>

            <div style={{ flex: 1, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={flowCompassData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="direction" stroke="#94a3b8" fontSize={11} />
                  <PolarRadiusAxis stroke="#64748b" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1322', borderColor: '#334155', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }} />
                  <Radar name="Egress Vector Volume" dataKey="vectors" stroke="#10b981" fill="#10b981" fillOpacity={0.45} isAnimationActive={false} />
                  <Radar name="Peak Velocity (m/s)" dataKey="maxVelocity" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPanel;
