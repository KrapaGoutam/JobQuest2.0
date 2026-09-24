import { type ReactNode } from 'react';

export type BadgeVariant = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface StatusBadgeProps {
  variant?: BadgeVariant;
  stage?: string;
  outcome?: string;
  children?: ReactNode;
  count?: number;
  className?: string;
}

export function StatusBadge({
  variant,
  stage,
  outcome,
  children,
  count,
  className = '',
}: StatusBadgeProps) {
  let resolvedVariant = variant ?? 'muted';

  if (stage) {
    const s = stage.toUpperCase();
    if (s === 'OFFER' || s === 'ACCEPTED') resolvedVariant = 'success';
    else if (s === 'INTERVIEW') resolvedVariant = 'accent';
    else if (s === 'SCREENING' || s === 'APPLIED') resolvedVariant = 'info';
    else if (s === 'PREPARING' || s === 'SAVED') resolvedVariant = 'muted';
  }

  if (outcome) {
    const o = outcome.toUpperCase();
    if (o === 'REJECTED') resolvedVariant = 'danger';
    else if (o === 'WITHDRAWN') resolvedVariant = 'warning';
    else resolvedVariant = 'muted';
  }

  return (
    <span className={`pill ${resolvedVariant} ${className}`}>
      {children || stage || outcome}
      {count !== undefined && <span className="cnt">{count}</span>}
    </span>
  );
}

export function CountBadge({
  count,
  variant = 'neutral',
  className = '',
}: {
  count: number;
  variant?: 'neutral' | 'danger';
  className?: string;
}) {
  return (
    <span className={`cnt ${variant === 'danger' ? 'danger' : ''} ${className}`}>
      {count}
    </span>
  );
}
