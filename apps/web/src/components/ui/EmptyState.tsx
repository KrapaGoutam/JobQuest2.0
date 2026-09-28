import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon = <Inbox size={22} />,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty ${className}`}>
      <div className="ic" aria-hidden="true">
        {icon}
      </div>
      <h3 style={{ margin: '4px 0 0 0', fontSize: '15px', fontWeight: 600 }}>{title}</h3>
      {description && (
        <p className="muted small" style={{ margin: 0, maxWidth: '360px' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}
