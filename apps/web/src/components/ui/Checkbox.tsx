import { forwardRef, type InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, checked, onChange, disabled, id, className = '', ...props },
  ref,
) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.6 : 1,
        fontSize: 'var(--font-size-base)',
      }}
      className={className}
    >
      <input
        ref={ref}
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          margin: 0,
          pointerEvents: 'none',
        }}
        {...props}
      />
      <span className={`cb ${checked ? 'on' : ''}`} aria-hidden="true">
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {label && <span>{label}</span>}
    </label>
  );
});
