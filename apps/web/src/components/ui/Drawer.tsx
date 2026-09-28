import { useId, useRef, type ReactNode } from 'react';
import { useOverlay } from './useOverlay';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = 380,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  useOverlay(isOpen, onClose, drawerRef);

  if (!isOpen) return null;

  const titleId = `drawer-title-${uid}`;
  const descId = description ? `drawer-description-${uid}` : undefined;

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="drawer m-sheet"
        style={{ width: `${width}px` }}
      >
        <div className="m-grab" aria-hidden="true" />
        <div className="dlg-h" style={{ borderBottom: '1px solid var(--color-border)' }}>
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
            aria-label="Close drawer"
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>
        <div className="dlg-b" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
        {footer && <div className="dlg-f">{footer}</div>}
      </div>
    </>
  );
}
