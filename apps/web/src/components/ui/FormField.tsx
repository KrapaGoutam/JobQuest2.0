import { type ReactNode, useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  optional?: boolean;
  helpText?: string;
  error?: string;
  id?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  optional,
  helpText,
  error,
  id: explicitId,
  children,
  className = '',
}: FormFieldProps) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={id} className="label">
          <span>{label}</span>
          {required && <span className="req" aria-hidden="true">*</span>}
          {optional && <span className="opt">(optional)</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {error && (
        <div id={errorId} className="ferr" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {!error && helpText && (
        <div id={helpId} className="help">
          {helpText}
        </div>
      )}
    </div>
  );
}
