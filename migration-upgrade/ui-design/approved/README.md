# Approved UI — folder guide

| Path | What it is | Authoritative? |
|---|---|---|
| `APPROVED_UI_BASELINE.md` | Approval record, design rules, implementation rule | **Yes** — rules |
| `jobquest-approved-mockup.html` | Self-contained interactive gallery of all 13 approved frames. It works offline, with icons and data inlined. | **Yes** — visual reference |
| `screenshots/*.png` | PNG captures of each frame | Reference (derived from the mockup) |
| `source/JobQuest Approved Mockup.dc.html` | Editable gallery source | Source for the HTML |
| `source/Direction D.dc.html` + `jq-data-d.js` + `support.js` | Editable screen source. Props: `screen`, `theme`, `manager` | Source |
| `source/_bundle/` | Inputs used to build the offline HTML | Build input only |
| `assets/` | Empty. Nothing external is needed; the icon font (Lucide) is inlined in the offline HTML. | — |

## Opening the mockup
- **Offline copy:** open `jobquest-approved-mockup.html` in any modern browser. No server is needed. The frames scroll vertically.
- **Editable source:** open `source/JobQuest Approved Mockup.dc.html`. Serve the folder over HTTP (e.g. `npx serve source`), because it loads sibling files. Its icon font comes from a CDN (unpkg lucide-static@0.469.0).

## Screenshots
- `dashboard-desktop-light.png` — D1 · Dashboard · Desktop 1440×960 · Light
- `dashboard-desktop-dark.png` — D2 · Dashboard · Desktop 1440×960 · Dark
- `applications-desktop-light.png` — D3 · Applications — table, 2 rows selected (bulk bar) · Desktop 1440×960 · Light
- `applications-desktop-dark.png` — D4 · Applications — table, 2 rows selected · Desktop 1440×960 · Dark
- `applications-preview-desktop.png` — D5 · Applications + preview pane · Wide desktop 1680×960 · Light
- `applications-preview-desktop-dark.png` — D6 · Applications + preview pane · Wide desktop 1680×960 · Dark
- `application-detail-desktop-light.png` — D7 · Application detail · Desktop 1440×960 · Light
- `application-detail-desktop-dark.png` — D8 · Application detail · Desktop 1440×960 · Dark
- `dashboard-mobile.png` — D9 · Dashboard · Mobile 390×844 (@2x) · Light
- `applications-mobile.png` — D10 · Applications · Mobile 390×844 (@2x) · Light
- `application-detail-mobile.png` — D11 · Application detail · Mobile 390×844 (@2x) · Dark
- `workspace-switcher.png` — D12 · Workspace switcher (open) · Desktop 1440×960 · Light
- `manager-owner-filter.png` — D13 · Manager context — Owner filter (open) · Desktop 1440×960 · Light

## How coding agents should use this folder
1. Read `APPROVED_UI_BASELINE.md` first, then the specs in `../` (tokens, IA, responsive, accessibility, component inventory).
2. Match layout, hierarchy, density, copy patterns and token usage from the screenshots and the HTML.
3. Take token values from `../DESIGN_TOKENS.md`, not by sampling pixels.
4. For screens not in the mockups, follow `../GATE_02B_DESIGN_BACKLOG.md`; don't invent them during implementation.

## Important
- The screenshots are **references, not production assets**. Don't ship them.
- The mockup HTML is **not production application code**. It uses inline styles, fixed frame sizes and fictional data. Rebuild it as real components.
- Sample data (companies, people, counts) is fictional. "Today" is Wed Sep 23, 2026.
