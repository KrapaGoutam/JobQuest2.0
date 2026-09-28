import { type ReactNode, type HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = '', style, ...props }: CardProps) {
  return (
    <div className={`card ${className}`} style={style} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  action,
  className = '',
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-h ${className}`} style={{ justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card-t ${className}`}>{children}</div>;
}

export function CardBody({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card-b ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardBand({
  type = 'neutral',
  children,
  className = '',
}: {
  type?: 'danger' | 'warning' | 'neutral';
  children: ReactNode;
  className?: string;
}) {
  return <div className={`band ${type} ${className}`}>{children}</div>;
}
