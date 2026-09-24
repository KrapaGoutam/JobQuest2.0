import { type CSSProperties } from 'react';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = 14,
  borderRadius = 'var(--radius-xs)',
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skel ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
