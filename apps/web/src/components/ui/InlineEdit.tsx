import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Edit2, Check, X } from 'lucide-react';

export interface InlineEditProps {
  value: string;
  onSave: (nextValue: string) => void;
  label: string;
  className?: string;
}

export function InlineEdit({ value, onSave, label, className = '' }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    if (currentVal.trim() !== value) {
      onSave(currentVal.trim());
    }
  };

  const handleCancel = () => {
    setCurrentVal(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} className={className}>
        <input
          ref={inputRef}
          aria-label={label}
          value={currentVal}
          onChange={(e) => setCurrentVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleCommit}
          style={{
            height: '28px',
            padding: '0 6px',
            fontSize: 'var(--font-size-base)',
            border: '1px solid var(--color-focus)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--field-bg)',
            color: 'var(--color-text)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          aria-label="Save changes"
          onClick={handleCommit}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--color-success)',
          }}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          aria-label="Cancel editing"
          onClick={handleCancel}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--color-text-muted)',
          }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      aria-label={`Edit ${label}: ${value}`}
      className={`btn ghost sm ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 6px',
        height: 'auto',
        color: 'var(--color-text)',
        fontWeight: 500,
      }}
    >
      <span>{value}</span>
      <Edit2 size={12} className="muted" aria-hidden="true" />
    </button>
  );
}
