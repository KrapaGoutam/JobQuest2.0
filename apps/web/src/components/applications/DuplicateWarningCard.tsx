import { AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DuplicateCheckResult } from '../../types/applications';

export interface DuplicateWarningCardProps {
  checkResult: DuplicateCheckResult | null;
  checkError?: string | null;
  onViewExisting?: (applicationId: string) => void;
  onOverride?: () => void;
  hasOverridden?: boolean;
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

  const match = checkResult.matches[0];
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
          Found existing tracking record for <strong>{match?.role_title}</strong> at <strong>{match?.company_name}</strong> (Stage: {match?.stage})
          {match?.job_url ? <span style={{ display: 'block', wordBreak: 'break-all' }}>URL: {match.job_url}</span> : null}
          {match?.external_job_id ? <span>Requisition: {match.external_job_id}</span> : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
          {match?.id && onViewExisting && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onViewExisting(match.id!)}
            >
              <ExternalLink size={14} style={{ marginRight: '6px' }} />
              View existing
            </Button>
          )}
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
          You already have an application for <strong>{match?.role_title}</strong> at <strong>{match?.company_name}</strong> in stage <strong>{match?.stage}</strong>.
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
          {match?.id && onViewExisting && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onViewExisting(match.id!)}
            >
              <ExternalLink size={14} style={{ marginRight: '6px' }} />
              View existing
            </Button>
          )}
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
          alignItems: 'center',
          gap: '10px',
        }}
        role="status"
        data-testid="duplicate-warning-possible"
      >
        <Info size={18} style={{ color: 'var(--color-brand-primary)', flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          You have applied to <strong>{match?.company_name}</strong> before ({checkResult.matches.length} other application{checkResult.matches.length > 1 ? 's' : ''}).
        </div>
      </div>
    );
  }

  return null;
}
