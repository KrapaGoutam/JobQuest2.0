import { createContext, useContext, useRef, type ReactNode } from 'react';

interface TabsContextValue {
  activeTab: string;
  onTabChange: (id: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

export function Tabs({
  activeTab,
  onTabChange,
  id,
  children,
  className = '',
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ activeTab, onTabChange, baseId: id }}>
      <div className={`tabs-wrapper ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({
  children,
  'aria-label': ariaLabel,
  className = '',
}: {
  children: ReactNode;
  'aria-label': string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!listRef.current) return;
    const tabs = Array.from(listRef.current.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== currentIndex) {
      const nextTab = tabs[nextIndex];
      if (nextTab) {
        nextTab.focus();
        nextTab.click();
      }
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`tabs ${className}`}
    >
      {children}
    </div>
  );
}

export function Tab({
  id,
  children,
  count,
  className = '',
}: {
  id: string;
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab must be used within Tabs');

  const isSelected = ctx.activeTab === id;
  const tabId = `${ctx.baseId}-tab-${id}`;
  const panelId = `${ctx.baseId}-panel-${id}`;

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={() => ctx.onTabChange(id)}
      className={`tab ${isSelected ? 'sel' : ''} ${className}`}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className="cnt"
          style={{
            background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
            color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function TabPanel({
  id,
  children,
  className = '',
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabPanel must be used within Tabs');

  const isSelected = ctx.activeTab === id;
  const tabId = `${ctx.baseId}-tab-${id}`;
  const panelId = `${ctx.baseId}-panel-${id}`;

  if (!isSelected) return null;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={0}
      className={`tab-panel ${className}`}
      style={{ outline: 'none', paddingTop: '16px' }}
    >
      {children}
    </div>
  );
}
