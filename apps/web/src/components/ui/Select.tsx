import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  isError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    options,
    children,
    isError,
    className = '',
    disabled,
    style,
    ...props
  },
  ref,
) {
  const containerClasses = [
    'input',
    isError ? 'err' : '',
    disabled ? 'dis' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} style={{ position: 'relative', paddingRight: '28px', ...style }}>
      <select
        ref={ref}
        disabled={disabled}
        style={{
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'inherit',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          width: '100%',
          appearance: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: 'var(--color-surface-1)', color: 'var(--color-text)' }}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <span
        style={{
          position: 'absolute',
          right: '8px',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--color-text-muted)',
        }}
        aria-hidden="true"
      >
        <ChevronDown size={14} />
      </span>
    </div>
  );
});
