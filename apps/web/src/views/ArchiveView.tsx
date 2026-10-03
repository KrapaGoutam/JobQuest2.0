import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Briefcase, FileText, Flame, RotateCw, Search, Users } from 'lucide-react';
import { fetchArchiveItems, type ArchiveDomain, type ArchiveItem } from '../api/planning';
import { restoreApplication, fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { restoreContact } from '../api/contacts';
import { restoreHabit } from '../api/habits';
import { restoreResume } from '../api/documents';
import { PlanningNav } from '../components/planning/PlanningNav';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { formatInZone } from '../lib/time';

const DOMAINS: Record<ArchiveDomain, { label: string; singular: string; icon: typeof Briefcase }> = {
  applications: { label: 'Applications', singular: 'application', icon: Briefcase },
  contacts: { label: 'Contacts', singular: 'contact', icon: Users },
  habits: { label: 'Habits', singular: 'habit', icon: Flame },
  documents: { label: 'Documents', singular: 'document', icon: FileText },
};
type DomainFilter = ArchiveDomain | 'all';

function isDomainFilter(value: string | null | undefined): value is DomainFilter {
  return value === 'all' || value === 'applications' || value === 'contacts' || value === 'habits' || value === 'documents';
}

async function restore(item: ArchiveItem): Promise<void> {
  if (item.domain === 'applications') await restoreApplication(item.id);
  else if (item.domain === 'contacts') await restoreContact(item.id);
  else if (item.domain === 'habits') await restoreHabit(item.id);
  else await restoreResume(item.id);
}

export function ArchiveView({
  activeWorkspaceId,
  currentUserId,
  isManager,
  initialDomain,
  onDomainChange,
  onNavigate,
}: {
  activeWorkspaceId: string | null;
  currentUserId: string | null;
  isManager: boolean;
  initialDomain?: string | null;
  onDomainChange: (domain: DomainFilter) => void;
  onNavigate: (path: string) => void;
}) {
  const { timeZone } = useProfileTimeZone(currentUserId);
  const [domain, setDomain] = useState<DomainFilter>(isDomainFilter(initialDomain) ? initialDomain : 'all');
  const [ownerId, setOwnerId] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (isDomainFilter(initialDomain)) setDomain(initialDomain);
  }, [initialDomain]);

  useEffect(() => {
    if (!activeWorkspaceId || !isManager) {
      setMembers([]);
      setOwnerId('');
      return;
    }
    void fetchWorkspaceMembers(activeWorkspaceId).then(setMembers).catch(() => setMembers([]));
  }, [activeWorkspaceId, isManager]);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchArchiveItems(activeWorkspaceId, ownerId || undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Archive.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerNames = useMemo(() => new Map(members.map((member) => [member.user_id, member.display_name || member.username])), [members]);
  const counts = useMemo(() => {
    const result: Record<ArchiveDomain, number> = { applications: 0, contacts: 0, habits: 0, documents: 0 };
    for (const item of items) result[item.domain] += 1;
    return result;
  }, [items]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => (domain === 'all' || item.domain === domain) && (!term || `${item.title} ${item.context}`.toLowerCase().includes(term)));
  }, [domain, items, query]);

  const chooseDomain = (next: DomainFilter) => {
    setDomain(next);
    onDomainChange(next);
  };
  const handleRestore = async (item: ArchiveItem) => {
    setPendingId(`${item.domain}:${item.id}`);
    setError(null);
    setAnnouncement(`Restoring ${item.title}`);
    try {
      await restore(item);
      setItems((current) => current.filter((candidate) => !(candidate.domain === item.domain && candidate.id === item.id)));
      setAnnouncement(`${item.title} restored`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Could not restore ${item.title}`;
      setAnnouncement(message);
      setError(message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="planning-page" data-testid="archive-view">
      <PlanningNav currentPath="/archive" onNavigate={onNavigate} />
      <header className="planning-page-header">
        <div>
          <p className="eyebrow">Recovery center</p>
          <h1>Archive</h1>
          <p className="muted">Restore recoverable records across JobQuest. Permanent deletion is not available here.</p>
        </div>
        {isManager ? (
          <Select aria-label="Archive owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">All members</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username}</option>)}
          </Select>
        ) : null}
      </header>

      <Card className="planning-filter-card">
        <CardBody>
          <div className="archive-domain-tabs" aria-label="Archive domains">
            <button type="button" aria-pressed={domain === 'all'} onClick={() => chooseDomain('all')}>All <span>{items.length}</span></button>
            {(Object.entries(DOMAINS) as [ArchiveDomain, (typeof DOMAINS)[ArchiveDomain]][]).map(([key, meta]) => {
              const Icon = meta.icon;
              return <button key={key} type="button" aria-pressed={domain === key} onClick={() => chooseDomain(key)}><Icon size={15} aria-hidden="true" /> {meta.label} <span>{counts[key]}</span></button>;
            })}
          </div>
          <label className="archive-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search archived records</span>
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search archive" />
          </label>
        </CardBody>
      </Card>

      {loading ? (
        <div className="planning-loading" role="status" aria-label="Loading Archive"><Skeleton height={360} /></div>
      ) : error && items.length === 0 ? (
        <EmptyState icon={<RotateCw size={22} />} title="Archive could not load" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ArchiveRestore size={22} />}
          title={items.length === 0 ? 'Nothing is archived' : 'No archived records match'}
          description={items.length === 0 ? 'Archived applications, contacts, habits, and documents will appear here.' : 'Try another domain, owner, or search.'}
        />
      ) : (
        <div className="archive-list" role="list">
          {filtered.map((item) => {
            const meta = DOMAINS[item.domain];
            const Icon = meta.icon;
            const pending = pendingId === `${item.domain}:${item.id}`;
            return (
              <Card key={`${item.domain}:${item.id}`} role="listitem" className="archive-item-card">
                <CardBody>
                  <span className={`archive-item-icon domain-${item.domain}`}><Icon size={18} aria-hidden="true" /></span>
                  <span className="archive-item-copy">
                    <span className="planning-kind">{meta.singular}</span>
                    <strong>{item.title}</strong>
                    <span className="muted small">{item.context || meta.label}</span>
                  </span>
                  <span className="archive-item-meta">
                    <span>Archived {formatInZone(item.archivedAt, timeZone, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {isManager && !ownerId ? <span className="muted">{ownerNames.get(item.ownerId)}</span> : null}
                  </span>
                  <span className="archive-item-actions">
                    <Button variant="ghost" size="sm" onClick={() => onNavigate(item.sourcePath)}>View</Button>
                    <Button size="sm" isLoading={pending} disabled={Boolean(pendingId)} aria-label={`Restore ${meta.singular} ${item.title}`} onClick={() => void handleRestore(item)} leftIcon={<ArchiveRestore size={14} />}>Restore</Button>
                  </span>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {error && items.length > 0 ? <p className="form-error" role="alert">{error}</p> : null}
      <span className="sr-only" aria-live="polite">{announcement || (loading ? 'Loading Archive' : `${filtered.length} archived records shown`)}</span>
    </div>
  );
}
