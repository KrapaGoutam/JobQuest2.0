import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface DropdownItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  isDanger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: (props: { 'aria-expanded': boolean; 'aria-haspopup': boolean; onClick: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: (DropdownItem | 'separator')[];
  align?: 'left' | 'right';
  width?: number;
}

export function Dropdown({ trigger, items, align = 'right', width = 200 }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => setIsOpen((prev) => !prev);
  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menuRef.current) {
        e.preventDefault();
        const menuItems = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
        if (menuItems.length === 0) return;
        const currentIndex = menuItems.findIndex((el) => el === document.activeElement);
        let nextIndex: number;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % menuItems.length;
        } else {
          nextIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1;
        }
        const targetEl = menuItems[nextIndex];
        if (targetEl) {
          targetEl.focus();
        }
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger({
        'aria-expanded': isOpen,
        'aria-haspopup': true,
        onClick: toggle,
        ref: triggerRef,
      })}

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align]: 0,
            zIndex: 40,
            width,
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-popover)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
          }}
        >
          {items.map((item, idx) => {
            if (item === 'separator') {
              return <div key={`sep-${idx}`} className="hr" style={{ margin: '4px 0' }} />;
            }
            return (
              <button
                key={item.id}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    close();
                  }
                }}
                className={`mi ${item.isDanger ? 'danger' : ''}`}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: 'var(--radius-sm)',
                  border: 0,
                  background: 'transparent',
                  color: item.isDanger ? 'var(--color-danger)' : 'var(--color-text)',
                  fontSize: 'var(--font-size-base)',
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                  fontFamily: 'inherit',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) e.currentTarget.style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>}
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
