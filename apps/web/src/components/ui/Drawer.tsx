import { useEffect, useRef, type ReactNode } from 'react';
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
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';

      const timer = setTimeout(() => {
        if (drawerRef.current) {
          const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          const firstEl = focusable[0];
          if (firstEl) {
            firstEl.focus();
          } else {
            drawerRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'Tab' && drawerRef.current) {
          const focusable = Array.from(
            drawerRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (first && last) {
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        if (triggerRef.current) {
          triggerRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titleId = 'drawer-title';
  const descId = description ? 'drawer-description' : undefined;

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
