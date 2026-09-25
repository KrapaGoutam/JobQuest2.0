import { Clock, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

export interface AgingBannerProps {
  staleCount: number;
  longWaitingCount: number;
  onFilterAging: (band: 'stale' | 'long_waiting') => void;
  onDismiss?: () => void;
}

export function AgingBanner({
  staleCount,
  longWaitingCount,
  onFilterAging,
}: AgingBannerProps) {
  const totalQuiet = staleCount + longWaitingCount;
  if (totalQuiet === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderLeft: '4px solid var(--color-warning)',
        gap: '12px',
        flexWrap: 'wrap',
      }}
      role="region"
      aria-label="Application aging advisory"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Clock size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
        <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
          You have{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>{totalQuiet} quiet application{totalQuiet > 1 ? 's' : ''}</strong>{' '}
          ({longWaitingCount > 0 ? `${longWaitingCount} in Long Waiting (31+d)` : ''}
          {longWaitingCount > 0 && staleCount > 0 ? ', ' : ''}
          {staleCount > 0 ? `${staleCount} Stale (15–30d)` : ''}) needing review.
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {longWaitingCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onFilterAging('long_waiting')}
          >
            Review Long Waiting <ArrowRight size={12} style={{ marginLeft: '4px' }} />
          </Button>
        )}
        {staleCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFilterAging('stale')}
          >
            View Stale ({staleCount})
          </Button>
        )}
      </div>
    </div>
  );
}
