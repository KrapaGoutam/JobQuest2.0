// Direction D sample data (fictional). Today = Wed Sep 23, 2026. ~600 applications.
// Aging bands = exact JobQuest1.0 agingBand(): <=3 New, <=7 Waiting, <=14 Follow-Up Recommended, <=30 Stale, >30 Long Waiting.
// Workflow shown in the PROPOSED JQ2 form: Stage (8 pipeline values) + Outcome (5 closed values). Pending approval.
(function () {
  const STAGES = ['Saved', 'Preparing', 'Applied', 'Assessment', 'Recruiter Screen', 'Interview', 'Final Interview', 'Offer'];
  const GROUP = [1, 1, 2, 2, 3, 4, 4, 5];
  const OUT = { Rejected: ['circle-x', 'var(--danger)'], Withdrawn: ['undo-2', 'var(--muted)'], Ghosted: ['ghost', 'var(--muted)'], 'Position Closed': ['ban', 'var(--muted)'], Accepted: ['circle-check', 'var(--success)'] };
  const band = d => d <= 3 ? ['New', 'var(--muted)', 'circle'] : d <= 7 ? ['Waiting', 'var(--muted)', 'hourglass'] : d <= 14 ? ['Follow-Up Recommended', 'var(--warning)', 'bell-ring'] : d <= 30 ? ['Stale', 'var(--danger)', 'moon'] : ['Long Waiting', 'var(--danger)', 'alarm-clock-off'];
  const bandShort = { New: 'New', Waiting: 'Waiting', 'Follow-Up Recommended': 'Follow-up rec.', Stale: 'Stale', 'Long Waiting': 'Long waiting' };
  const PRI = { High: 3, Medium: 2, Low: 1 };
  const OWN = { MO: 'Maya Ortiz', DP: 'Dev Patel', LK: 'Lena Kim', SR: 'Sam Rivera', AN: 'Ari Novak' };
  const raw = [
    ['JQ-1039', 'Northwind Analytics', 'Product Designer II', 'Denver, CO', 2, '', 'Medium', 'Send 2nd follow-up', -5, 16, 'Company site', 'Sep 07', 'DP'],
    ['JQ-1036', 'Meridian Bank', 'UX Designer', 'Charlotte, NC', 2, '', 'Medium', 'Final follow-up or close', -4, 21, 'Indeed', 'Sep 02', 'LK'],
    ['JQ-1041', 'Aster Mobility', 'Principal Designer', 'San Francisco, CA', 2, '', 'High', 'Ask Jonah for intro', -2, 11, 'LinkedIn', 'Sep 05', 'MO'],
    ['JQ-1055', 'Lumen Civic', 'Senior Designer', 'Remote (US)', 4, '', 'Medium', 'Follow up with hiring manager', -1, 9, 'Wellfound', 'Sep 09', 'MO'],
    ['JQ-1042', 'Corvid Labs', 'Staff Product Designer', 'Seattle, WA', 6, '', 'High', 'Send thank-you note', 0, 1, 'Referral', 'Sep 01', 'MO'],
    ['JQ-1060', 'Oakridge Energy', 'Senior UX Researcher', 'Houston, TX', 1, '', 'Medium', 'Tailor resume & apply', 0, 4, 'Indeed', '—', 'SR'],
    ['JQ-1051', 'Halcyon Health', 'Senior Product Designer', 'Remote (US)', 4, '', 'High', 'Prep recruiter call', 1, 2, 'LinkedIn', 'Sep 08', 'MO'],
    ['JQ-1057', 'Quarry Health', 'Senior Product Designer', 'Remote (US)', 4, '', 'Medium', 'Schedule screen', 1, 1, 'Recruiter', 'Sep 12', 'DP'],
    ['JQ-1033', 'Brightline Freight', 'Lead UX Designer', 'Chicago, IL', 5, '', 'High', 'Portfolio review prep', 2, 0, 'Recruiter', 'Aug 28', 'MO'],
    ['JQ-1028', 'Tessellate', 'Design Systems Designer', 'Remote (US)', 7, '', 'High', 'Review offer terms', 5, 1, 'Referral', 'Aug 19', 'MO'],
    ['JQ-1062', 'Kestrel Insurance', 'UX Lead', 'Remote (US)', 0, '', 'Low', 'Tailor resume', 5, 2, 'LinkedIn', '—', 'AN'],
    ['JQ-1044', 'Parallax Games', 'Product Designer', 'Austin, TX', 3, '', 'Low', 'Submit design exercise', 6, 6, 'LinkedIn', 'Sep 02', 'DP'],
    ['JQ-1058', 'Sable & Co.', 'Product Designer', 'New York, NY', 2, '', 'Medium', '1st follow-up', 6, 8, 'Referral', 'Sep 15', 'SR'],
    ['JQ-1064', 'Harbor Logistics', 'Senior UX Designer', 'Remote (US)', 2, '', 'Medium', '1st follow-up', 9, 3, 'LinkedIn', 'Sep 20', 'AN'],
    ['JQ-1022', 'Fjord Robotics', 'Interaction Designer', 'Boston, MA', 2, '', 'Medium', null, null, 29, 'Company site', 'Aug 20', 'LK'],
    ['JQ-1017', 'Juniper Transit', 'UX Designer', 'Portland, OR', 2, '', 'Low', null, null, 34, 'LinkedIn', 'Aug 12', 'DP'],
    ['JQ-0998', 'Vantage Retail', 'Senior Product Designer', 'Remote (US)', 2, '', 'Medium', null, null, 63, 'Indeed', 'Jul 21', 'MO'],
    ['JQ-1003', 'Cobalt Pay', 'Product Designer', 'Remote (US)', 5, 'Rejected', 'Medium', null, null, 12, 'LinkedIn', 'Aug 03', 'MO']
  ];
  const dd = d => { const n = 23 + d; return n > 30 ? 'Oct ' + String(n - 30).padStart(2, '0') : 'Sep ' + n; };
  const dueText = d => d == null ? 'Not set' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 0 ? (-d) + 'd overdue' : dd(d);
  const dec = r => {
    const [id, company, role, loc, si, outcome, pri, next, due, idle, source, applied, own] = r;
    const b = band(idle), closed = !!outcome;
    return {
      id, company, role, loc, si, stage: STAGES[si], outcome, closed, pri, due, idle, source, applied,
      stageText: closed ? 'Reached ' + STAGES[si] : STAGES[si],
      outIcon: closed ? OUT[outcome][0] : '', outColor: closed ? OUT[outcome][1] : 'transparent', outLabel: outcome || '',
      next: next || 'No next action', nextColor: next ? 'var(--fg)' : 'var(--muted)', nextStyle: next ? 'normal' : 'italic',
      initial: company[0], owner: OWN[own], ownerInitials: own, ownerFirst: OWN[own].split(' ')[0],
      pips: [1, 2, 3, 4, 5].map(i => ({ bg: GROUP[si] >= i ? (closed ? 'var(--muted)' : 'var(--primary)') : 'var(--border-strong)' })),
      priBars: [1, 2, 3].map(n => ({ h: 3 + n * 3, bg: n <= PRI[pri] ? 'var(--fg)' : 'var(--border-strong)' })),
      dueText: dueText(due), dueColor: due == null ? 'var(--muted)' : due < 0 ? 'var(--danger)' : due === 0 ? 'var(--warning)' : 'var(--muted)',
      dueIcon: due == null ? 'circle-dashed' : due < 0 ? 'triangle-alert' : due === 0 ? 'clock' : 'calendar', dueWeight: due != null && due <= 0 ? 600 : 400,
      overdue: due != null && due < 0,
      band: b[0], bandShort: bandShort[b[0]], bandColor: b[1], bandIcon: b[2], idleText: idle === 0 ? 'today' : idle + 'd',
      review: idle >= 28 && !closed,
      check: 'square', checkColor: 'var(--border-strong)', rowBg: 'transparent', rowLine: 'transparent'
    };
  };
  const apps = raw.map(dec);
  const active = apps.filter(a => !a.closed);
  const by = Object.fromEntries(apps.map(a => [a.company, a]));
  const queueOver = active.filter(a => a.overdue).sort((a, b) => a.due - b.due);
  const queueToday = [
    { text: 'Send thank-you note', co: 'Corvid Labs', kind: 'Next action', icon: 'briefcase', meta: 'Final Interview · 1d', app: true },
    { text: 'Tailor resume & apply', co: 'Oakridge Energy', kind: 'Next action', icon: 'briefcase', meta: 'Posting closes Sep 25', app: true },
    { text: 'Coffee chat with Ana Liu', co: 'Contact · Networking', kind: 'Task', icon: 'user', meta: '4:30 PM' },
    { text: 'Update portfolio case study', co: 'Task · weekly', kind: 'Task', icon: 'list-todo', meta: 'Recurring' }
  ];
  const interviews = [
    { co: 'Halcyon Health', type: 'Recruiter screen', with: 'Dana Cole', day: 'THU', date: '24', time: '2:30 PM', mode: 'Video', rel: 'Tomorrow' },
    { co: 'Brightline Freight', type: 'Portfolio review', with: 'Omar Haddad +2', day: 'FRI', date: '25', time: '11:00 AM', mode: 'On-site', rel: 'In 2 days' },
    { co: 'Tessellate', type: 'Offer call', with: 'Rhea Sato', day: 'MON', date: '28', time: '10:00 AM', mode: 'Phone', rel: 'In 5 days' }
  ];
  const review = active.filter(a => a.review).sort((a, b) => b.idle - a.idle);
  const activity = [
    ['calendar-check', 'Final interview completed', 'Corvid Labs', 'Yesterday'],
    ['flag', 'Moved to Interview', 'Brightline Freight', 'Yesterday'],
    ['circle-x', 'Outcome → Rejected (reached Interview)', 'Cobalt Pay', 'Sep 21'],
    ['send', 'Applied', 'Harbor Logistics', 'Sep 20'],
    ['mail', 'Recruiter replied', 'Quarry Health', 'Sep 19']
  ].map(([icon, text, co, when]) => ({ icon, text, co, when }));
  const PC = [38, 12, 96, 9, 14, 8, 3, 1];
  const pipeline = STAGES.map((label, i) => ({ label, n: PC[i], w: Math.round(PC[i] / 96 * 100) + '%' }));
  const funnel = [['Applied', 562], ['Recruiter Screen', 71], ['Interview', 29], ['Final Interview', 11], ['Offer', 4], ['Accepted', 0]]
    .map(([label, n]) => ({ label, n, pct: Math.round(n / 562 * 1000) / 10 + '%', w: Math.max(n / 562 * 100, 0.6) + '%' }));
  const E = (date, time, type, title, detail, x) => Object.assign({ date, time, type, title, detail, from: '', to: '',
    icon: { captured: 'bookmark', applied: 'send', stage: 'flag', contact: 'mail', ivs: 'calendar-plus', ivd: 'calendar-check', note: 'message-square', next: 'alarm-clock', task: 'square-check', followup: 'reply', system: 'cpu' }[type],
    kind: { captured: 'System', applied: 'Stage', stage: 'Stage', contact: 'Contact', ivs: 'Interview', ivd: 'Interview', note: 'Note', next: 'Next action', task: 'Task', followup: 'Follow-up', system: 'System' }[type],
    actor: ['captured', 'system'].includes(type) ? 'System' : 'Maya', isNote: type === 'note', isStage: type === 'stage', plain: type !== 'note' && type !== 'stage' }, x || {});
  const events = [
    E('Sep 22', '4:10 PM', 'note', 'Note', 'Elena hinted at a decision by early October. Team of 6; design-system maturity is the focus for this hire.'),
    E('Sep 22', '4:02 PM', 'next', 'Next action set', 'Send thank-you note · due Sep 23'),
    E('Sep 22', '1:00 PM', 'ivd', 'Final interview completed', 'Panel · 4 interviewers · on-site · 3 h'),
    E('Sep 21', '6:30 PM', 'task', 'Task completed', 'Prepare panel case study'),
    E('Sep 18', '9:30 AM', 'stage', 'Stage changed', '', { from: 'Interview', to: 'Final Interview' }),
    E('Sep 16', '10:05 AM', 'followup', 'Follow-up sent', 'Email to Elena Ruiz after 1st interview'),
    E('Sep 12', '11:20 AM', 'ivs', 'Interview scheduled', 'Panel · Tue Sep 22, 10:00 AM'),
    E('Sep 10', '3:45 PM', 'stage', 'Stage changed', '', { from: 'Recruiter Screen', to: 'Interview' }),
    E('Sep 08', '10:30 AM', 'ivd', 'Recruiter screen completed', 'Priya Nair · 30 min · video'),
    E('Sep 05', '2:15 PM', 'stage', 'Stage changed', '', { from: 'Applied', to: 'Recruiter Screen' })
  ];
  const groups = [];
  events.forEach(e => { let g = groups[groups.length - 1]; if (!g || g.date !== e.date) groups.push(g = { date: e.date, day: e.date.split(' ')[1], mon: e.date.split(' ')[0].toUpperCase(), events: [] }); g.events.push(e); });
  const tasks = [['Send thank-you note', 'Today', 'var(--warning)', false], ['Follow up on decision', 'Oct 02', 'var(--muted)', false], ['Prepare panel case study', 'Sep 21', 'var(--muted)', true]]
    .map(([t, due, c, done]) => ({ t, due, dueColor: c, icon: done ? 'square-check' : 'square', color: done ? 'var(--muted)' : 'var(--fg)', deco: done ? 'line-through' : 'none' }));
  const ivs = [['Final interview · panel', 'Sep 22 · 10:00 AM', 'Completed'], ['Interview · Elena Ruiz', 'Sep 15 · 1:00 PM', 'Completed'], ['Recruiter screen', 'Sep 08 · 10:00 AM', 'Completed']].map(([t, w, s]) => ({ t, w, s }));
  const contacts = [['Elena Ruiz', 'ER', 'Design Director', 'Hiring manager'], ['Priya Nair', 'PN', 'Technical Recruiter', 'Recruiter'], ['Jonah Wells', 'JW', 'Senior Designer', 'Referral']].map(([name, initials, role, type]) => ({ name, initials, role, type }));
  const docs = [['Resume — Product v3.pdf', 'Resume version · used in 14 applications'], ['Cover letter — Corvid.pdf', 'Cover letter · Sep 01']].map(([n, m]) => ({ n, m }));
  const facts = [['Source', 'Referral · Jonah Wells'], ['Job URL', 'careers.corvidlabs.example/2291'], ['Requisition ID', 'CRV-2291'], ['Salary', '$185k–$215k'], ['Type', 'Full-time · Hybrid'], ['Captured', 'Aug 30 · extension']].map(([k, v]) => ({ k, v, link: k === 'Job URL' }));
  const workspaces = [
    { name: 'Personal', initials: 'MO', color: 'oklch(0.52 0.13 265)', role: 'User', meta: '600 applications', on: true },
    { name: 'Career Lab · Cohort 7', initials: 'CL', color: 'oklch(0.55 0.12 160)', role: 'Manager', meta: '12 members · 7,214 applications' },
    { name: 'Northside Bootcamp', initials: 'NB', color: 'oklch(0.58 0.13 55)', role: 'User', meta: '3 members' }
  ];
  const members = [['All members', '', '7,214', true], ['Maya Ortiz', 'MO', '600'], ['Dev Patel', 'DP', '812'], ['Lena Kim', 'LK', '455'], ['Sam Rivera', 'SR', '903'], ['Ari Novak', 'AN', '377']]
    .map(([name, ini, n, all]) => ({ name, ini, n, all: !!all, notAll: !all }));
  window.JQD = { STAGES, OUT, apps, active, by, queueOver, queueToday, interviews, review, activity, pipeline, funnel, events, groups, tasks, ivs, contacts, docs, facts, workspaces, members, app: by['Corvid Labs'] };
})();
