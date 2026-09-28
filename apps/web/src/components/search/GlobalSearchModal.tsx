import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  Briefcase,
  Users,
  BookOpen,
  Calendar,
  FileText,
  Clock,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import { executeGlobalSearch, type SearchResultItem, type SearchDomain } from '../../api/search';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspaceId: string | null;
  onNavigate: (path: string) => void;
}

const DOMAIN_FILTERS: { id: SearchDomain | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: <Search size={13} /> },
  { id: 'application', label: 'Applications', icon: <Briefcase size={13} /> },
  { id: 'contact', label: 'Contacts', icon: <Users size={13} /> },
  { id: 'note', label: 'Notes', icon: <BookOpen size={13} /> },
  { id: 'interview', label: 'Interviews', icon: <Calendar size={13} /> },
  { id: 'document', label: 'Documents', icon: <FileText size={13} /> },
];

export function GlobalSearchModal({
  isOpen,
  onClose,
  activeWorkspaceId,
  onNavigate,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchDomain | 'all'>('all');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    if (!activeWorkspaceId || typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(`jq_recent_searches_${activeWorkspaceId}`);
      if (stored) {
        setRecentSearches(JSON.parse(stored) as string[]);
      }
    } catch {
      setRecentSearches([]);
    }
  }, [activeWorkspaceId]);

  const saveRecentSearch = useCallback(
    (term: string) => {
      if (!activeWorkspaceId || !term.trim() || typeof window === 'undefined') return;
      try {
        const clean = term.trim();
        const updated = [clean, ...recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
        setRecentSearches(updated);
        localStorage.setItem(`jq_recent_searches_${activeWorkspaceId}`, JSON.stringify(updated));
      } catch {
        // Ignore localStorage quota errors
      }
    },
    [activeWorkspaceId, recentSearches]
  );

  const clearRecentSearches = useCallback(() => {
    if (!activeWorkspaceId || typeof window === 'undefined') return;
    try {
      setRecentSearches([]);
      localStorage.removeItem(`jq_recent_searches_${activeWorkspaceId}`);
    } catch {
      // Ignore
    }
  }, [activeWorkspaceId]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search query execution
  useEffect(() => {
    if (!isOpen || !activeWorkspaceId) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await executeGlobalSearch(activeWorkspaceId, trimmed, 30);
        setResults(data);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen, activeWorkspaceId]);

  // Filtered results based on domain pill
  const filteredResults = activeFilter === 'all'
    ? results
    : results.filter((r) => r.domain === activeFilter);

  const handleSelectResult = useCallback(
    (item: SearchResultItem) => {
      saveRecentSearch(query || item.title);
      onClose();
      onNavigate(item.deep_link);
    },
    [onClose, onNavigate, query, saveRecentSearch]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredResults.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredResults.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults.length > 0 && filteredResults[selectedIndex]) {
        handleSelectResult(filteredResults[selectedIndex]);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && filteredResults.length > 0) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredResults]);

  if (!isOpen) return null;

  const getDomainIcon = (domain: SearchDomain) => {
    switch (domain) {
      case 'application':
        return <Briefcase size={14} style={{ color: 'var(--color-accent)' }} />;
      case 'contact':
        return <Users size={14} style={{ color: 'var(--color-info, #0284c7)' }} />;
      case 'note':
        return <BookOpen size={14} style={{ color: 'var(--color-success, #16a34a)' }} />;
      case 'interview':
        return <Calendar size={14} style={{ color: 'var(--color-warning, #d97706)' }} />;
      case 'document':
        return <FileText size={14} style={{ color: 'var(--color-purple, #9333ea)' }} />;
    }
  };

  const getDomainLabel = (domain: SearchDomain) => {
    switch (domain) {
      case 'application':
        return 'Application';
      case 'contact':
        return 'Contact';
      case 'note':
        return 'Journal Note';
      case 'interview':
        return 'Interview';
      case 'document':
        return 'Document';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Search Command Palette"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'min(15vh, 120px)',
        paddingLeft: '16px',
        paddingRight: '16px',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: 'min(75vh, 600px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-1)',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-1)',
          }}
        >
          <Search size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search JobQuest workspace"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="global-search-results-list"
            aria-activedescendant={
              filteredResults[selectedIndex] ? `search-item-${filteredResults[selectedIndex].id}` : undefined
            }
            placeholder="Search applications, contacts, notes, interviews, documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '15px',
              color: 'var(--color-text-strong)',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--color-text-muted)',
              }}
              aria-label="Clear search input"
            >
              <X size={16} />
            </button>
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              letterSpacing: '0.05em',
            }}
          >
            ESC
          </span>
        </div>

        {/* Domain Filter Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: 'var(--color-surface-2)',
            borderBottom: '1px solid var(--color-border)',
            overflowX: 'auto',
          }}
        >
          {DOMAIN_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: activeFilter === f.id ? 600 : 500,
                borderRadius: 'var(--radius-full, 9999px)',
                border: 'none',
                cursor: 'pointer',
                background: activeFilter === f.id ? 'var(--color-accent)' : 'transparent',
                color: activeFilter === f.id ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
                transition: 'background 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {f.icon}
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Results / Empty Viewport */}
        <div
          ref={listRef}
          id="global-search-results-list"
          role="listbox"
          aria-label="Search results"
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '400px',
            padding: '8px',
          }}
        >
          {loading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              Searching workspace...
            </div>
          ) : query.trim() ? (
            filteredResults.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--color-text-strong)' }}>
                  No results found
                </p>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  No matches for &ldquo;{query}&rdquo; in this workspace.
                </p>
              </div>
            ) : (
              filteredResults.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${item.domain}-${item.id}`}
                    id={`search-item-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 8px)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-surface-2)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {getDomainIcon(item.domain)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color: 'var(--color-text-strong)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title}
                        </span>
                        <span className="pill muted" style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {item.badge || getDomainLabel(item.domain)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-text-muted)',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.subtitle}
                        {item.snippet ? ` · ${item.snippet}` : ''}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: isSelected ? 1 : 0 }}>
                      <ArrowRight size={14} />
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* Recent Searches view when query is empty */
            <div style={{ padding: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                  RECENT SEARCHES
                </span>
                {recentSearches.length > 0 && (
                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear history
                  </button>
                )}
              </div>
              {recentSearches.length === 0 ? (
                <div style={{ padding: '16px 8px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  Type keywords to search across Applications, Contacts, Notes, Interviews, and Documents.
                </div>
              ) : (
                recentSearches.map((term) => (
                  <div
                    key={term}
                    onClick={() => {
                      setQuery(term);
                      inputRef.current?.focus();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md, 6px)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--color-text-strong)',
                    }}
                    className="hover-surface-2"
                  >
                    <Clock size={13} style={{ color: 'var(--color-text-muted)' }} />
                    <span style={{ flex: 1 }}>{term}</span>
                    <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span><kbd style={{ background: 'var(--color-surface-1)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>↑↓</kbd> navigate</span>
            <span><kbd style={{ background: 'var(--color-surface-1)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--color-border)' }}><CornerDownLeft size={10} style={{ display: 'inline' }} /></kbd> open</span>
          </div>
          <div>
            <span>Workspace: <b>Active</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
