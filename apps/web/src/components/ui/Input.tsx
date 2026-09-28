import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    leftIcon,
    rightIcon,
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
    <div className={containerClasses} style={style}>
      {leftIcon && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)' }}>{leftIcon}</span>}
      <input ref={ref} disabled={disabled} {...props} />
      {rightIcon && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)' }}>{rightIcon}</span>}
    </div>
  );
});
