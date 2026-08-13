import React, { useMemo } from 'react';
import { useLiveDataStore } from '../store/liveDataStore';
import type { ResourceAllocationSuggestion } from '../types/api';

// Priority sorting weight helper
const getPriorityWeight = (priority: string = ''): number => {
  switch (priority.toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

// Priority Badge Styling (Visually distinct from Zone Risk badges)
const getPriorityStyle = (priority: string = '') => {
  switch (priority.toLowerCase()) {
    case 'high':
      return {
        bg: 'rgba(239, 68, 68, 0.12)',
        border: 'rgba(239, 68, 68, 0.4)',
        color: '#f87171',
        label: 'HIGH PRIORITY',
      };
    case 'medium':
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        border: 'rgba(245, 158, 11, 0.4)',
        color: '#facc15',
        label: 'MEDIUM PRIORITY',
      };
    case 'low':
    default:
      return {
        bg: 'rgba(59, 130, 246, 0.12)',
        border: 'rgba(59, 130, 246, 0.4)',
        color: '#60a5fa',
        label: 'LOW PRIORITY',
      };
  }
};

// Suggestion type icon & human-readable label helper
const getSuggestionMeta = (suggestionType: string = '') => {
  switch (suggestionType.toLowerCase()) {
    case 'security_personnel':
      return {
        icon: '👮‍♂️',
        label: 'Security Personnel Deployment',
        badgeBg: 'rgba(6, 182, 212, 0.1)',
        badgeColor: 'var(--color-accent-cyan)',
      };
    case 'medical_tent':
      return {
        icon: '🚑',
        label: 'Medical Station Setup',
        badgeBg: 'rgba(244, 63, 94, 0.1)',
        badgeColor: '#fb7185',
      };
    case 'barricade_reconfiguration':
      return {
        icon: '🚧',
        label: 'Barricade Flow Control',
        badgeBg: 'rgba(245, 158, 11, 0.1)',
        badgeColor: '#fcd34d',
      };
    default:
      return {
        icon: '⚡',
        label: suggestionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        badgeBg: 'rgba(148, 163, 184, 0.1)',
        badgeColor: '#cbd5e1',
      };
  }
};

export const ResourceAllocationPanel: React.FC = () => {
  const suggestions = useLiveDataStore((state) => state.resourceAllocationSuggestions);

  // Sort suggestions: High priority first, then medium, then low (preserving order received)
  const sortedSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];
    return [...suggestions].sort(
      (a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
    );
  }, [suggestions]);

  // 1. Nominal / Empty State
  if (!sortedSuggestions || sortedSuggestions.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: 'rgba(5, 8, 17, 0.4)',
          borderRadius: '8px',
          border: '1px solid var(--border-panel)',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            marginBottom: '0.75rem',
          }}
        >
          🚑
        </div>
        <h3
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: 'var(--color-accent-blue)',
            marginBottom: '0.25rem',
            textTransform: 'uppercase',
          }}
          className="font-mono"
        >
          No Resource Reallocation Needed
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: '280px' }}>
          Current venue physical deployments, medical posts, and gate barricades are operating within nominal safety thresholds.
        </p>
      </div>
    );
  }

  // 2. Active Suggestions List
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        overflowY: 'auto',
        maxHeight: '100%',
        paddingRight: '0.2rem',
      }}
    >
      {sortedSuggestions.map((item: ResourceAllocationSuggestion, idx: number) => {
        const priorityMeta = getPriorityStyle(item.priority);
        const typeMeta = getSuggestionMeta(item.suggestion_type);

        return (
          <div
            key={`${item.zone_id}_${item.suggestion_type}_${idx}`}
            style={{
              backgroundColor: 'rgba(13, 19, 34, 0.85)',
              border: '1px solid var(--border-panel)',
              borderRadius: '6px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              transition: 'border-color 0.2s ease',
            }}
          >
            {/* Suggestion Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
              {/* Type Icon & Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{typeMeta.icon}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc' }}>
                    {typeMeta.label}
                  </span>
                  <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--color-accent-cyan)' }}>
                    TARGET ZONE: {item.zone_id}
                  </span>
                </div>
              </div>

              {/* Priority Badge (Distinct from risk levels) */}
              <span
                className="font-mono"
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  backgroundColor: priorityMeta.bg,
                  border: `1px solid ${priorityMeta.border}`,
                  color: priorityMeta.color,
                }}
              >
                {priorityMeta.label}
              </span>
            </div>

            {/* Reason Description */}
            <p style={{ fontSize: '0.735rem', color: 'var(--color-text-muted)', lineHeight: '1.35', paddingLeft: '0.2rem' }}>
              <strong style={{ color: 'var(--color-text-main)' }}>Reasoning:</strong> {item.reason}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default ResourceAllocationPanel;
