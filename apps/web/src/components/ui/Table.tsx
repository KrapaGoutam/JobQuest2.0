import { type ReactNode, type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from './Skeleton';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

export function Table({ children, className = '', style, ...props }: TableProps) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
      <table
        className={`tbl ${className}`}
        style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', border: 0, ...style }}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  isSelected?: boolean;
}

export function TableRow({ children, isSelected, className = '', style, ...props }: TableRowProps) {
  return (
    <tr
      className={`table-row ${isSelected ? 'sel' : ''} ${className}`}
      style={{
        height: 'var(--row-height)',
        borderBottom: '1px solid var(--color-border)',
        background: isSelected ? 'var(--interactive-selected)' : 'var(--color-surface-1)',
        transition: 'background var(--duration-fast)',
        ...style,
      }}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
  align?: 'left' | 'center' | 'right';
}

export function TableHead({
  children,
  sortable,
  sortDirection,
  onSort,
  align = 'left',
  style,
  ...props
}: TableHeadProps) {
  return (
    <th
      style={{
        height: '34px',
        padding: '0 12px',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        color: 'var(--color-text-muted)',
        whiteSpace: 'nowrap',
        textAlign: align,
        userSelect: sortable ? 'none' : 'auto',
        cursor: sortable ? 'pointer' : 'default',
        ...style,
      }}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span>{children}</span>
        {sortable && (
          <span style={{ display: 'flex', alignItems: 'center', color: sortDirection ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
            {sortDirection === 'asc' ? (
              <ArrowUp size={12} />
            ) : sortDirection === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} opacity={0.6} />
            )}
          </span>
        )}
      </div>
    </th>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export function TableCell({ children, align = 'left', style, ...props }: TableCellProps) {
  return (
    <td
      style={{
        padding: '0 12px',
        fontSize: 'var(--font-size-base)',
        color: 'var(--color-text)',
        textAlign: align,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, message = 'No records found' }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-muted)' }}>
        {message}
      </td>
    </tr>
  );
}

export function TableSkeletonRows({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ height: 'var(--row-height)', borderBottom: '1px solid var(--color-border)' }}>
          <td colSpan={colSpan} style={{ padding: '0 12px' }}>
            <Skeleton width="100%" height={16} />
          </td>
        </tr>
      ))}
    </>
  );
}
