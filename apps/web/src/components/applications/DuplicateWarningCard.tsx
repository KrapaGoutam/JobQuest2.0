import { AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Application, DuplicateCheckResult } from '../../types/applications';

export interface DuplicateWarningCardProps {
  checkResult: DuplicateCheckResult | null;
  checkError?: string | null;
  onViewExisting?: (applicationId: string) => void;
  onOverride?: () => void;
  hasOverridden?: boolean;
}

function duplicateDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function DuplicateMatches({
  matches,
  onViewExisting,
}: {
  matches: Partial<Application>[];
  onViewExisting?: (applicationId: string) => void;
}) {
  return (
    <ul aria-label="Matching applications" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
      {matches.map((match, index) => {
        const when = duplicateDate(match.applied_at ?? match.created_at);
        const state = match.status === 'CLOSED' ? (match.outcome ? `Closed · ${match.outcome.toLowerCase().replaceAll('_', ' ')}` : 'Closed') : 'Open';
        return (
          <li key={match.id ?? `${match.company_name}-${match.role_title}-${index}`} style={{ padding: '9px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600 }}>{match.role_title || 'Untitled role'} at {match.company_name || 'Unknown company'}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                {state}{match.stage ? ` · ${match.stage.toLowerCase().replaceAll('_', ' ')}` : ''}{when ? ` · Applied ${when}` : ''}
              </div>
            </div>
            {match.id && onViewExisting && (
              <Button type="button" variant="outline" size="sm" onClick={() => onViewExisting(match.id!)}>
                <ExternalLink size={14} style={{ marginRight: '6px' }} aria-hidden="true" />
                View existing
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DuplicateWarningCard({
  checkResult,
  checkError,
  onViewExisting,
  onOverride,
  hasOverridden = false,
}: DuplicateWarningCardProps) {
  if (checkError) {
    return (
      <div
        className="card-band card-band-warning"
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-warning)',
        }}
        role="alert"
      >
        <AlertTriangle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
            Couldn't check for duplicates
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            This isn't the same as no duplicate. You can proceed, but verify your records.
          </div>
        </div>
      </div>
    );
  }

  if (!checkResult || checkResult.tier === 'NONE' || !checkResult.matches || checkResult.matches.length === 0) {
    return null;
  }

  const { tier } = checkResult;

  if (tier === 'STRONG') {
    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-danger)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
        role="alert"
        data-testid="duplicate-warning-strong"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} style={{ color: 'var(--color-danger)' }} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-danger)' }}>
            Strong duplicate: You already track this posting
          </span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          The posting URL or requisition ID matches {checkResult.matches.length === 1 ? 'an existing record' : `${checkResult.matches.length} existing records`}.
        </div>
        <DuplicateMatches matches={checkResult.matches} onViewExisting={onViewExisting} />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
          {onOverride && !hasOverridden && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOverride}
              style={{ color: 'var(--color-text-muted)' }}
            >
              Save anyway
            </Button>
          )}
          {hasOverridden && (
            <span style={{ fontSize: '11px', color: 'var(--color-warning)', fontWeight: 600 }}>
              Override active (will create separate record)
            </span>
          )}
        </div>
      </div>
    );
  }

  if (tier === 'PROBABLE') {
    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-warning)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
        role="alert"
        data-testid="duplicate-warning-probable"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-warning)' }}>
            Probable duplicate: Same company and role title
          </span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          The company and role title match {checkResult.matches.length === 1 ? 'an existing record' : `${checkResult.matches.length} existing records`}.
        </div>
        <DuplicateMatches matches={checkResult.matches} onViewExisting={onViewExisting} />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
          {onOverride && !hasOverridden && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOverride}
              style={{ color: 'var(--color-text-muted)' }}
            >
              Save anyway
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (tier === 'POSSIBLE') {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-brand-primary)',
          display: 'flex',
          alignItems: 'stretch',
          flexDirection: 'column',
          gap: '10px',
        }}
        role="status"
        data-testid="duplicate-warning-possible"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={18} style={{ color: 'var(--color-brand-primary)', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            You have other applications at this company. Review them before creating another record.
          </div>
        </div>
        <DuplicateMatches matches={checkResult.matches} onViewExisting={onViewExisting} />
      </div>
    );
  }

  return null;
}
