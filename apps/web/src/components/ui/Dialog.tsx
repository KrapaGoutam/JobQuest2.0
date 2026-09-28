import { useId, useRef, type ReactNode } from 'react';
import { useOverlay } from './useOverlay';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 520,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  useOverlay(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  const titleId = `dialog-title-${uid}`;
  const descId = description ? `dialog-description-${uid}` : undefined;

  return (
    <>
      {/* Dialogs stack above drawers (they can be opened from a drawer). */}
      <div className="scrim scrim-dialog" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="dialog"
        style={{ maxWidth }}
      >
        <div className="dlg-h">
          <div style={{ flex: 1 }}>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descId} className="muted small" style={{ margin: '4px 0 0 0' }}>
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon={<X size={16} />}
            aria-label="Close dialog"
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>
        <div className="dlg-b">{children}</div>
        {footer && <div className="dlg-f">{footer}</div>}
      </div>
    </>
  );
}
