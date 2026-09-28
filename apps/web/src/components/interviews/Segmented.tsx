import { useRef, type ReactNode } from 'react';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
}

/**
 * Gate 02B segmented control (`.seg`) with radio-group semantics: one tab stop,
 * arrow keys move and select, Home/End jump.
 */
export function Segmented({
  label,
  value,
  options,
  onChange,
  id,
  describedBy,
}: {
  label: string;
  value: string | null;
  options: readonly SegmentedOption[];
  onChange: (value: string) => void;
  id?: string;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (next: number) => {
    const opt = options[(next + options.length) % options.length]!;
    onChange(opt.value);
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[(next + options.length) % options.length]?.focus();
  };

  return (
    <div
      ref={ref}
      id={id}
      className="seg"
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      style={{ flexWrap: 'wrap' }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index - 1); }
        else if (e.key === 'Home') { e.preventDefault(); move(0); }
        else if (e.key === 'End') { e.preventDefault(); move(options.length - 1); }
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && i === 0) ? 0 : -1}
            className={on ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
