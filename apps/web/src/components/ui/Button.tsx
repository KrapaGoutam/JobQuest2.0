import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-outline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    className = '',
    disabled,
    ...props
  },
  ref,
) {
  const variantClass = {
    primary: 'primary',
    secondary: '',
    outline: '',
    ghost: 'ghost',
    danger: 'danger',
    'danger-outline': 'danger-o',
    link: 'link',
  }[variant];

  const sizeClass = size === 'md' ? '' : size;

  const classes = ['btn', variantClass, sizeClass, className].filter(Boolean).join(' ');

  return (
    <button ref={ref} className={classes} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <Loader2 className="animate-spin" size={14} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});
