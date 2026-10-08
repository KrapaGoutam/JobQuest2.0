import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../context/ToastContext';
import { listWorkspaceAuditEvents, type WorkspaceAuditEvent } from '../api/workspace';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Download, ShieldAlert } from 'lucide-react';

export function AuditHistoryView() {
  const { activeWorkspaceId, isManager } = useWorkspace();
  const { addToast } = useToast();

  const [events, setEvents] = useState<WorkspaceAuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [scope, setScope] = useState<'ALL' | 'AI' | 'OTHER'>('ALL');

  const loadEvents = useCallback(async () => {
    if (!activeWorkspaceId || !isManager) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await listWorkspaceAuditEvents(activeWorkspaceId, 100);
      setEvents(data);
    } catch (err) {
      addToast({
        title: 'Failed to load audit events',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, isManager, addToast]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterAction !== 'ALL' && e.action !== filterAction) return false;
      // AI Hub events are namespaced AI_*; this separates them from membership/security events.
      if (scope === 'AI' && !e.action.startsWith('AI_')) return false;
      if (scope === 'OTHER' && e.action.startsWith('AI_')) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesActor = e.actor_name?.toLowerCase().includes(q);
        const matchesTarget = e.target_user_name?.toLowerCase().includes(q);
        const matchesAction = e.action?.toLowerCase().includes(q);
        if (!matchesActor && !matchesTarget && !matchesAction) return false;
      }
      return true;
    });
  }, [events, filterAction, scope, search]);

  const handleExport = () => {
    if (filteredEvents.length === 0) return;

    const headers = ['When', 'Actor', 'Action', 'Affected Member', 'Details'];
    const rows = filteredEvents.map((e) => [
      new Date(e.occurred_at).toISOString(),
      e.actor_name,
      e.action,
      e.target_user_name || '—',
      e.payload ? JSON.stringify(e.payload).replace(/"/g, '""') : '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => `"${r.join('","')}"`)].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      title: 'Export complete',
      description: `Exported ${filteredEvents.length} audit records.`,
      type: 'info',
    });
  };

  if (!isManager) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div
          className="banner neutral"
          style={{
            maxWidth: '540px',
            margin: '40px auto',
            padding: '24px',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <ShieldAlert size={32} className="warning-t" />
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Manager access required</h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
            Audit history tracks sensitive cross-member actions and is only accessible to workspace managers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '24px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Title */}
      <div
        className="page-title"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Audit history</h1>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Sensitive and cross-member actions · read-only
          </div>
        </div>

        <Button variant="secondary" onClick={handleExport} disabled={filteredEvents.length === 0}>
          <Download size={15} />
          <span>Export</span>
        </Button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ width: '220px' }}>
          <Input
            placeholder="Search audit events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: '34px' }}
          />
        </div>

        <div style={{ width: '160px' }}>
          <Select
            aria-label="Filter by event scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'ALL' | 'AI' | 'OTHER')}
            style={{ height: '34px' }}
          >
            <option value="ALL">Scope: All events</option>
            <option value="AI">AI Hub events</option>
            <option value="OTHER">Membership &amp; security</option>
          </Select>
        </div>

        <div style={{ width: '180px' }}>
          <Select
            aria-label="Filter by action"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ height: '34px' }}
          >
            <option value="ALL">Action: All</option>
            <option value="INVITATION_CREATED">Invite created</option>
            <option value="INVITATION_REVOKED">Invite revoked</option>
            <option value="ROLE_CHANGED">Role changed</option>
            <option value="STATUS_CHANGED">Status changed</option>
            <option value="MEMBER_REMOVED">Member removed</option>
            <option value="MEMBER_JOINED">Member joined</option>
          </Select>
        </div>
      </div>

      {/* Audit Table */}
      <div
        className="tbl card"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          className="tr th"
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 150px 1.2fr 160px 1.4fr',
            gap: '12px',
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span>When</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Affected member</span>
          <span>Details</span>
        </div>

        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            Loading audit events…
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            No audit events found.
          </div>
        ) : (
          filteredEvents.map((e) => {
            const when = new Date(e.occurred_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const isSensitive = /REMOVED|SUSPENDED|REVOKED|DELETED/i.test(e.action);

            let actionLabel = e.action;
            if (e.action === 'INVITATION_CREATED') actionLabel = 'Created invite code';
            else if (e.action === 'INVITATION_REVOKED') actionLabel = 'Revoked invite code';
            else if (e.action === 'ROLE_CHANGED') actionLabel = 'Changed role';
            else if (e.action === 'STATUS_CHANGED') actionLabel = 'Changed status';
            else if (e.action === 'MEMBER_REMOVED') actionLabel = 'Removed member';
            else if (e.action === 'MEMBER_JOINED') actionLabel = 'Joined workspace';

            const payloadStr = e.payload ? JSON.stringify(e.payload) : '—';

            return (
              <div
                key={e.event_id}
                className="tr"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 150px 1.2fr 160px 1.4fr',
                  gap: '12px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  fontSize: '13px',
                }}
              >
                <span className="small muted">{when}</span>
                <span className="ell b" style={{ fontWeight: 600 }}>
                  {e.actor_name}
                </span>
                <span className={`ell ${isSensitive ? 'danger-t' : ''}`} style={{ fontWeight: isSensitive ? 600 : 400 }}>
                  {actionLabel}
                </span>
                <span className="ell muted">{e.target_user_name || '—'}</span>
                <span className="ell small mono muted" title={payloadStr}>
                  {payloadStr}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="small muted" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
        Routine edits to your own records aren't listed here; they appear on each record's timeline.
      </div>
    </div>
  );
}
