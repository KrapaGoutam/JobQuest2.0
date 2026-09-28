import { forwardRef, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    isError,
    className = '',
    disabled,
    style,
    rows = 3,
    ...props
  },
  ref,
) {
  const containerClasses = [
    'input',
    'ta',
    isError ? 'err' : '',
    disabled ? 'dis' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} style={style}>
      <textarea ref={ref} disabled={disabled} rows={rows} {...props} />
    </div>
  );
});
