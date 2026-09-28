import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconButtonVariant = 'default' | 'ghost' | 'primary' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    'aria-label': ariaLabel,
    variant = 'default',
    size = 'md',
    icon,
    className = '',
    style,
    ...props
  },
  ref,
) {
  const variantClass = variant === 'ghost' ? 'ghost' : variant === 'primary' ? 'primary' : '';
  const sizeStyles = {
    sm: { width: 28, height: 28, fontSize: 13 },
    md: { width: 32, height: 32, fontSize: 15 },
    lg: { width: 40, height: 40, fontSize: 18 },
  }[size];

  return (
    <button
      ref={ref}
      className={['ibtn', variantClass, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      style={{ ...sizeStyles, ...style }}
      {...props}
    >
      {icon}
    </button>
  );
});
