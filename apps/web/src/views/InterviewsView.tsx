import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ClipboardPen, Video, Phone, MapPin, CalendarX, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Drawer } from '../components/ui/Drawer';
import { useToast } from '../context/ToastContext';
import { useProfileTimeZone } from '../hooks/useProfileTimeZone';
import { fetchInterview, fetchInterviewCounts, fetchInterviews, INTERVIEWS_PAGE_SIZE } from '../api/interviews';
import { fetchCanonicalWorkflow, fetchWorkspaceMembers, type WorkspaceMemberInfo } from '../api/applications';
import { ScheduleInterviewDialog } from '../components/interviews/ScheduleInterviewDialog';
import { RecordOutcomeDialog } from '../components/interviews/RecordOutcomeDialog';
import { InterviewDetailPanel } from '../components/interviews/InterviewDetailPanel';
import {
  INTERVIEW_TYPES,
  formatLabel,
  interviewStatus,
  resultLabel,
  resultVariant,
  typeLabel,
  upcomingBand,
  type Interview,
  type InterviewTab,
} from '../types/interviews';
import type { CanonicalWorkflow } from '../types/applications';
import { formatInZone, formatTime } from '../lib/time';

const FORMAT_ICON = { VIDEO: Video, PHONE: Phone, ONSITE: MapPin } as const;
const WIDE = '(min-width: 1100px)';

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export interface InterviewsViewProps {
  activeWorkspaceId: string | null;
  isManager: boolean;
  currentUserId: string | null;
}

export function InterviewsView({ activeWorkspaceId: ws, isManager, currentUserId }: InterviewsViewProps) {
  const { addToast } = useToast();
  const { timeZone, weekStart, setTimeZone } = useProfileTimeZone(currentUserId);
  const wide = useMedia(WIDE);

  const [tab, setTab] = useState<InterviewTab>('upcoming');
  const [ownerId, setOwnerId] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Interview[]>([]);
  const [total, setTotal] = useState(0);
  const [needsBand, setNeedsBand] = useState<Interview[]>([]);
  const [recentBand, setRecentBand] = useState<Interview[]>([]);
  const [counts, setCounts] = useState({ upcoming: 0, needs_outcome: 0, past: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Interview | null>(null);
  const [workflow, setWorkflow] = useState<CanonicalWorkflow | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Interview | null>(null);
  const seq = useRef(0);
  /** Which tab/filter/page the rows on screen belong to; never show another tab's rows. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!ws) return;
    fetchCanonicalWorkflow(ws).then(setWorkflow).catch(() => setWorkflow(null));
    if (isManager) fetchWorkspaceMembers(ws).then(setMembers).catch(() => setMembers([]));
  }, [ws, isManager]);

  // Going from the side panel to the narrow layout must not pop a sheet open by itself.
  useEffect(() => {
    if (!wide) setSelected(null);
  }, [wide]);

  const filters = useMemo(() => ({ ownerId: ownerId || undefined, interviewType: type || undefined }), [ownerId, type]);

  const viewKey = `${ws}|${tab}|${ownerId}|${type}|${page}`;
  const load = useCallback(async () => {
    if (!ws) return;
    const mine = ++seq.current;
    const key = `${ws}|${tab}|${ownerId}|${type}|${page}`;
    setLoading(true);
    setError(null);
    try {
      const [list, c, needs, recent] = await Promise.all([
        fetchInterviews(ws, tab, filters, page),
        fetchInterviewCounts(ws, filters),
        tab === 'upcoming' ? fetchInterviews(ws, 'needs_outcome', filters, 0, 5) : Promise.resolve(null),
        tab === 'upcoming' ? fetchInterviews(ws, 'past', filters, 0, 3) : Promise.resolve(null),
      ]);
      if (mine !== seq.current) return;
      setRows(list.interviews);
      setTotal(list.total);
      setCounts(c);
      setNeedsBand(needs?.interviews ?? []);
      setRecentBand(recent?.interviews ?? []);
      setLoadedKey(key);
    } catch (e) {
      if (mine === seq.current) {
        setError((e as Error).message);
        setLoadedKey(key);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [ws, tab, filters, page, ownerId, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshSelected = useCallback(async () => {
    await load();
    if (selected) {
      try {
        setSelected(await fetchInterview(selected.id));
      } catch {
        setSelected(null);
      }
    }
  }, [load, selected]);

  const onSaved = (message: string) => {
    addToast({ title: message, type: 'success' });
    void refreshSelected();
  };

  const ownerName = (uid: string) => {
    if (uid === currentUserId) return 'You';
    const m = members.find((x) => x.user_id === uid);
    return m ? m.display_name || m.username : null;
  };

  if (!ws) {
    return <EmptyState title="No workspace selected" description="Choose a workspace to see its interviews." />;
  }

  const renderRow = (i: Interview, band: string) => {
    const status = interviewStatus(i);
    const Icon = FORMAT_ICON[i.format] ?? Video;
    const isSel = selected?.id === i.id;
    const who = [...(i.interview_contacts ?? []).filter((p) => p.contacts).map((p) => p.contacts!.full_name), i.interviewer_names].filter(Boolean).join(', ');
    return (
      <div key={`${band}-${i.id}`} className={`irow ${isSel ? 'sel' : ''}`} data-testid="interview-row" data-status={status}>
        <div className="dtile" aria-hidden="true">
          <span>{formatInZone(i.scheduled_at, timeZone, { weekday: 'short' }).toUpperCase()}</span>
          <b>{formatInZone(i.scheduled_at, timeZone, { day: 'numeric' })}</b>
        </div>
        <button type="button" className="irow-main" onClick={() => setSelected(i)} aria-label={`Open ${typeLabel(i.interview_type)} at ${i.applications?.company_name ?? 'application'}, ${formatInZone(i.scheduled_at, timeZone, { weekday: 'long', month: 'long', day: 'numeric' })} ${formatTime(i.scheduled_at, timeZone)}`}>
          <div className="b ell">
            {i.applications?.company_name} <span className="muted" style={{ fontWeight: 400 }}>· {i.applications?.role_title}</span>
          </div>
          <div className="small muted ell">
            {typeLabel(i.interview_type)} · round {i.round_number}
            {who && ` · with ${who}`}
            {isManager && ownerName(i.user_id) && ` · ${ownerName(i.user_id)}`}
          </div>
        </button>
        <div className="small row nowrap irow-time" style={{ gap: 6 }}>
          <Icon size={14} className="muted" aria-hidden="true" />
          {formatTime(i.scheduled_at, timeZone)} · {formatLabel(i.format)}
        </div>
        <div className="irow-status">
          {status === 'needs_outcome' && (
            <span className="pill warning">
              <ClipboardPen size={12} aria-hidden="true" />
              Outcome needed
            </span>
          )}
          {status === 'completed' && <span className={`pill ${resultVariant(i.outcome)}`}>{resultLabel(i.outcome)}</span>}
          {status === 'cancelled' && (
            <span className="pill muted">
              <CalendarX size={12} aria-hidden="true" />
              Cancelled
            </span>
          )}
          {status === 'upcoming' && (i.preparation_notes || i.questions_expected) && <span className="pill muted">Prep notes added</span>}
        </div>
        <div className="row irow-act" style={{ justifyContent: 'flex-end' }}>
          {status === 'needs_outcome' ? (
            <Button size="sm" variant="primary" onClick={() => setOutcomeFor(i)}>
              Record outcome
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setSelected(i)} aria-label={`Open ${typeLabel(i.interview_type)} at ${i.applications?.company_name ?? 'application'}`}>
              Open
            </Button>
          )}
        </div>
      </div>
    );
  };

  const bandBlock = (key: string, label: string, list: Interview[], tone: 'warning' | 'neutral' = 'neutral') =>
    list.length > 0 && (
      <div key={key} role="group" aria-label={label}>
        <div className={`band ${tone}`}>
          {tone === 'warning' && <ClipboardPen size={13} aria-hidden="true" />}
          {label.toUpperCase()} · {list.length}
        </div>
        {list.map((i) => renderRow(i, key))}
      </div>
    );

  const renderList = () => {
    if (loadedKey !== viewKey || (loading && rows.length === 0)) {
      return (
        <div role="status" aria-label="Loading interviews" className="col" style={{ gap: 8, padding: 16 }}>
          {[0, 1, 2].map((n) => (
            <div key={n} className="skel" style={{ height: 48 }} />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="col" style={{ padding: 24, gap: 10, alignItems: 'flex-start' }}>
          <span className="danger-t">Could not load interviews: {error}</span>
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={13} />} onClick={() => void load()}>
            Retry
          </Button>
        </div>
      );
    }
    if (tab === 'upcoming') {
      const bands = { THIS_WEEK: [] as Interview[], NEXT_WEEK: [] as Interview[], LATER: [] as Interview[] };
      for (const i of rows) bands[upcomingBand(i.scheduled_at, timeZone, Date.now(), weekStart)].push(i);
      if (!rows.length && !needsBand.length && !recentBand.length) {
        return (
          <EmptyState
            title="No upcoming interviews"
            description="Schedule an interview from here or from an application."
            action={<Button variant="primary" leftIcon={<CalendarPlus size={14} />} onClick={() => setScheduleOpen(true)}>Schedule interview</Button>}
          />
        );
      }
      return (
        <>
          {bandBlock('needs', 'Needs outcome', needsBand, 'warning')}
          {bandBlock('this', 'This week', bands.THIS_WEEK)}
          {bandBlock('next', 'Next week', bands.NEXT_WEEK)}
          {bandBlock('later', 'Later', bands.LATER)}
          {!rows.length && <div className="small muted" style={{ padding: '12px 16px' }}>Nothing scheduled ahead.</div>}
          {bandBlock('recent', 'Recent', recentBand)}
        </>
      );
    }
    if (!rows.length) {
      return <EmptyState title={tab === 'needs_outcome' ? 'Nothing needs an outcome' : 'No past interviews yet'} description={tab === 'needs_outcome' ? 'Interviews that have started show up here until you record how they went.' : 'Completed and cancelled interviews appear here.'} />;
    }
    return (
      <>
        {rows.map((i) => renderRow(i, tab))}
        {total > INTERVIEWS_PAGE_SIZE && (
          <div className="row small" style={{ padding: '10px 16px', gap: 8, justifyContent: 'space-between' }}>
            <span className="muted">
              {page * INTERVIEWS_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * INTERVIEWS_PAGE_SIZE)} of {total}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * INTERVIEWS_PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          </div>
        )}
      </>
    );
  };

  const detail = selected && (
    <InterviewDetailPanel
      key={selected.id}
      interview={selected}
      timeZone={timeZone}
      ownerName={isManager ? ownerName(selected.user_id) : null}
      onClose={() => setSelected(null)}
      onEdit={(i) => setEditing(i)}
      onRecordOutcome={(i) => setOutcomeFor(i)}
      onChanged={() => void refreshSelected()}
      variant={wide ? 'panel' : 'sheet'}
    />
  );

  return (
    <div className="page int-page">
      <div className="page-title">
        <h1>Interviews</h1>
        <span className="muted" data-testid="interview-summary">
          {counts.upcoming} upcoming · {counts.needs_outcome} needs outcome
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="primary" leftIcon={<CalendarPlus size={14} />} onClick={() => setScheduleOpen(true)}>
          Schedule interview
        </Button>
      </div>

      <div className="row int-toolbar" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Tabs id="interviews-tabs" activeTab={tab} onTabChange={(t) => { setTab(t as InterviewTab); setPage(0); }}>
          <TabList aria-label="Interview lists">
            <Tab id="upcoming" count={counts.upcoming}>Upcoming</Tab>
            <Tab id="needs_outcome" count={counts.needs_outcome}>Needs outcome</Tab>
            <Tab id="past" count={counts.past}>Past</Tab>
          </TabList>
        </Tabs>
        <span style={{ flex: 1 }} />
        <label className="sr-only" htmlFor="int-type-filter">Interview type</label>
        <Select id="int-type-filter" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} style={{ width: 170 }}>
          <option value="">All types</option>
          {INTERVIEW_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </Select>
        {isManager && (
          <>
            <label className="sr-only" htmlFor="int-owner-filter">Owner</label>
            <Select id="int-owner-filter" value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPage(0); }} style={{ width: 190 }}>
              <option value="">Owner: all members</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.user_id === currentUserId ? 'You' : m.display_name || m.username}</option>
              ))}
            </Select>
          </>
        )}
      </div>

      <div className="int-body">
        <div
          className="card int-list"
          role="tabpanel"
          id={`interviews-tabs-panel-${tab}`}
          aria-labelledby={`interviews-tabs-tab-${tab}`}
          aria-busy={loading}
          tabIndex={0}
        >
          {renderList()}
        </div>
        {wide && detail}
      </div>

      {!wide && selected && (
        <Drawer isOpen onClose={() => setSelected(null)} title={typeLabel(selected.interview_type)} width={Math.min(520, window.innerWidth)}>
          {detail}
        </Drawer>
      )}

      <ScheduleInterviewDialog
        isOpen={scheduleOpen || editing !== null}
        onClose={() => { setScheduleOpen(false); setEditing(null); }}
        workspaceId={ws}
        workflow={workflow}
        timeZone={timeZone}
        onChangeTimeZone={setTimeZone}
        editing={editing}
        onSaved={onSaved}
      />
      <RecordOutcomeDialog
        isOpen={outcomeFor !== null}
        onClose={() => setOutcomeFor(null)}
        interview={outcomeFor}
        workflow={workflow}
        timeZone={timeZone}
        onSaved={onSaved}
      />
    </div>
  );
}
