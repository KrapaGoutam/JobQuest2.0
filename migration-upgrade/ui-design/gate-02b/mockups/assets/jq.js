/* JobQuest 2.0 — Gate 02B mockup helpers (design reference only).
   Renders the APPROVED Direction D shell so every new frame shares the
   exact same chrome. Sample data is fictional; "today" = Wed Sep 23, 2026. */
(function () {
  const WS = {
    personal: { name: 'Personal', short: 'Personal', initials: 'MO', color: 'oklch(0.52 0.13 265)', role: 'User', mgr: false },
    nb: { name: 'Northside Bootcamp', short: 'Northside Bootcamp', initials: 'NB', color: 'oklch(0.58 0.13 55)', role: 'User', mgr: false },
    lab: { name: 'Career Lab · Cohort 7', short: 'Career Lab · Cohort 7', initials: 'CL', color: 'oklch(0.55 0.12 160)', role: 'Manager', mgr: true }
  };
  const NAV = [
    ['layout-dashboard', 'Dashboard', 'dashboard'],
    ['briefcase', 'Applications', 'applications', '457'],
    ['list-checks', 'Tasks & Follow-ups', 'tasks', '4', 'danger'],
    ['users', 'Contacts', 'contacts'],
    ['calendar-days', 'Calendar', 'calendar'],
    ['#Track'],
    ['messages-square', 'Interviews', 'interviews'],
    ['repeat', 'Habits', 'habits'],
    ['notebook-pen', 'Journal', 'journal'],
    ['file-text', 'Resumes', 'resumes'],
    ['#Insights'],
    ['chart-line', 'Analytics', 'analytics']
  ];
  const NAV_MGR = [
    ['#Workspace'],
    ['user-round', 'Members', 'members'],
    ['arrow-down-up', 'Import & export', 'import'],
    ['settings-2', 'Workflow', 'workflow'],
    ['history', 'Audit history', 'audit']
  ];

  function nav(active, mgr, counts) {
    const list = mgr ? NAV.concat(NAV_MGR) : NAV;
    return list.map(n => {
      if (n[0][0] === '#') return `<div class="nav-head">${n[0].slice(1)}</div>`;
      let badge = n[3];
      if (mgr && n[2] === 'applications') badge = '5,380';
      if (counts && counts[n[2]] !== undefined) badge = counts[n[2]];
      const b = badge ? `<span class="nbadge ${n[4] || ''}">${badge}</span>` : '';
      return `<div class="nav-item ${active === n[2] ? 'cur' : ''}" ${active === n[2] ? 'aria-current="page"' : ''}><i class="icon-${n[0]}"></i>${n[1]}${b}</div>`;
    }).join('');
  }

  /* Desktop frame with approved sidebar + header. o = {theme, ws, active, crumb, size, rail, overlay} */
  function shell(o, content) {
    const ws = WS[o.ws || 'personal'];
    const mgr = ws.mgr;
    const size = o.size || 'd';
    const rail = o.rail;
    const side = rail ? `
      <aside class="side rail" style="border-top:3px solid ${ws.color};align-items:center;padding-top:10px;gap:6px">
        <span class="ws-tile" style="background:${ws.color};width:36px;height:36px" title="${ws.name}">${ws.initials}</span>
        <span class="ibtn" style="background:var(--primary);color:var(--primary-fg);border-color:var(--primary);margin:6px 0" aria-label="New application"><i class="icon-plus"></i></span>
        ${['layout-dashboard', 'briefcase', 'list-checks', 'users', 'calendar-days', 'messages-square', 'repeat', 'notebook-pen', 'file-text', 'chart-line'].map((ic, i) => `<span class="ibtn ghost" style="${['dashboard', 'applications', 'tasks', 'contacts', 'calendar', 'interviews', 'habits', 'journal', 'resumes', 'analytics'][i] === o.active ? 'background:var(--primary-soft);color:var(--primary)' : 'color:var(--muted)'}"><i class="icon-${ic}"></i></span>`).join('')}
        <span style="flex:1"></span><span class="ibtn ghost" style="color:var(--muted);margin-bottom:8px"><i class="icon-settings"></i></span>
      </aside>` : `
      <aside class="side" style="border-top:3px solid ${ws.color}">
        <div style="padding:10px 10px 6px"><div class="ws-btn" role="button" aria-haspopup="menu" aria-label="Switch workspace. Current: ${ws.name}, role ${ws.role}">
          <span class="ws-tile" style="background:${ws.color}">${ws.initials}</span>
          <div class="grow"><div class="b ell">${ws.name}</div><div class="xs muted">${ws.role}</div></div>
          <i class="icon-chevrons-up-down muted" style="font-size:14px"></i></div></div>
        <div style="padding:4px 10px 8px"><div class="newapp"><i class="icon-plus" style="font-size:15px"></i>New application</div></div>
        <nav class="nav" aria-label="Primary">${nav(o.active, mgr, o.counts)}</nav>
        <div class="side-foot">
          <div class="nav-item ${o.active === 'settings' ? 'cur' : ''}"><i class="icon-settings"></i>Settings</div>
          <div class="row" style="height:44px;padding:0 10px;gap:10px"><span class="av" style="width:28px;height:28px;font-size:11px">MO</span>
            <div class="grow"><div class="b">Maya Ortiz</div><div class="xs muted ell">maya@example.com</div></div>
            <span class="row xs muted" style="height:26px;padding:0 7px;gap:4px;border:1px solid var(--border);border-radius:6px"><i class="icon-monitor"></i>System</span></div>
        </div>
      </aside>`;
    const hdr = `
      <header class="hdr">
        <div class="crumb"><span class="dot" style="background:${ws.color}"></span>${ws.short}<i class="icon-chevron-right" style="font-size:12px"></i><b>${o.crumb || ''}</b></div>
        ${mgr ? '<span class="mgr-badge"><i class="icon-shield-check success-t"></i>Manager · workspace-wide access</span>' : ''}
        <div class="search" style="${size === 't' ? 'width:240px' : ''}"><i class="icon-search"></i><span class="grow ell">Search applications, contacts, notes</span><span class="kbd">/</span>${size === 't' ? '' : '<span class="kbd" style="opacity:.55">⌘K</span>'}</div>
        <div class="bell"><i class="icon-bell"></i><b>4</b></div>
      </header>`;
    return `<div data-jq class="frame-${size}" data-theme="${o.theme || 'light'}">${side}<main class="main">${hdr}${content}</main>${o.overlay || ''}</div>`;
  }

  /* Mobile frame. o = {theme, title, back, tab, ws (chip), actions, noTabs, overlay} */
  function mobile(o, content) {
    const ws = WS[o.ws || 'personal'];
    const tabs = [['house', 'Today', 'today', '4'], ['briefcase', 'Apps', 'apps'], ['list-checks', 'Tasks', 'tasks'], ['users', 'Contacts', 'contacts'], ['menu', 'More', 'more']];
    const left = o.back
      ? `<span class="m-ib" aria-label="Back"><i class="icon-chevron-left"></i></span>`
      : o.chip === false ? '' : `<span class="row" style="height:32px;padding:0 10px 0 4px;border:1px solid var(--border);border-radius:16px;gap:6px;flex:none"><span class="av" style="background:${ws.color};color:#fff">${ws.initials}</span><span class="b" style="font-size:14px">${ws.short.split(' ·')[0]}</span><i class="icon-chevron-down muted"></i></span>`;
    const hdr = o.noHeader ? '' : `<div class="m-hdr" style="${o.back ? '' : `border-top:3px solid ${ws.color}`}">${left}<h2>${o.title || ''}</h2>${o.actions === undefined ? '<span class="m-ib"><i class="icon-search"></i></span><span class="m-ib"><i class="icon-bell"></i></span>' : o.actions}</div>`;
    const bar = o.noTabs ? (o.bottom || '') : `<nav class="m-tabbar" aria-label="Primary">${tabs.map(t => `<div class="m-tab ${o.tab === t[2] ? 'on' : ''}" style="position:relative"><i class="icon-${t[0]}"></i>${t[3] ? `<b style="position:absolute;top:8px;left:calc(50% + 4px);min-width:17px;height:17px;border-radius:9px;background:var(--danger);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center">${t[3]}</b>` : ''}${t[1]}</div>`).join('')}</nav>`;
    return `<div data-jq class="frame-m" data-theme="${o.theme || 'light'}">
      <div class="m-status" style="border-radius:28px 28px 0 0"><span>9:41</span><span class="row" style="gap:5px;font-size:14px"><i class="icon-signal"></i><i class="icon-wifi"></i><i class="icon-battery"></i></span></div>
      ${hdr}<div class="m-body" style="${o.bodyStyle || ''}">${content}</div>${bar}${o.overlay || ''}</div>`;
  }

  /* Gallery: sections = [{title, desc, items:[{cap, sub, html}]}] */
  function gallery(title, intro, sections) {
    document.title = 'JobQuest 2.0 · Gate 02B · ' + title;
    let h = `<div class="g-head"><h1>${title}</h1><p>${intro}</p></div>`;
    sections.forEach(s => {
      h += `<div class="g-head" style="padding-top:18px"><h1 style="font-size:16px">${s.title}</h1>${s.desc ? `<p>${s.desc}</p>` : ''}</div><div class="g-row">`;
      s.items.forEach(it => { const id = it.id || 'f-' + (it.cap.split(' ')[0] || ''); h += `<div class="g-item" id="${id}"><div class="g-cap">${it.cap} <span>${it.sub || ''}</span></div>${it.html}</div>`; });
      h += '</div>';
    });
    document.body.className = 'gallery';
    document.body.innerHTML = h + '<div style="height:40px"></div>';
  }

  /* small builders */
  const pips = (n, closed) => `<span class="pips ${closed ? 'closed' : ''}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const pri = p => { const n = { High: 3, Medium: 2, Low: 1 }[p]; return `<span class="row nowrap" style="gap:6px"><span class="pri">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>${p}</span>`; };
  const AGING = { New: ['circle', 'var(--muted)'], Waiting: ['hourglass', 'var(--muted)'], 'Follow-Up Recommended': ['bell-ring', 'var(--warning)'], Stale: ['moon', 'var(--danger)'], 'Long Waiting': ['alarm-clock-off', 'var(--danger)'] };
  const aging = (band, days) => `<span class="row nowrap" style="gap:5px;color:${AGING[band][1]}"><i class="icon-${AGING[band][0]}"></i>${band}<span class="muted">· ${days}</span></span>`;
  const OUT = { Open: ['circle-dot', 'var(--muted)'], Rejected: ['circle-x', 'var(--danger)'], Withdrawn: ['undo-2', 'var(--muted)'], Ghosted: ['ghost', 'var(--muted)'], 'Position Closed': ['ban', 'var(--muted)'], Accepted: ['circle-check', 'var(--success)'] };
  const outcome = o => `<span class="row nowrap" style="gap:5px;color:${OUT[o][1]}"><i class="icon-${OUT[o][0]}"></i>${o}</span>`;
  const icon = (n, s) => `<i class="icon-${n}" ${s ? `style="${s}"` : ''}></i>`;

  window.JQ = { WS, shell, mobile, gallery, pips, pri, aging, outcome, icon };
})();
