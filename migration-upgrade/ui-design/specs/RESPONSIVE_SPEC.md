# Responsive spec (approved baseline)

Breakpoint names: **Mobile** < 768 · **Tablet** 768–1279 · **Desktop** 1280–1679 · **Wide desktop** ≥ 1680. Approved frames: Desktop 1440 (D1–D4, D7, D8, D12, D13), Wide 1680 (D5, D6), Mobile 390 (D9–D11). The Tablet column below is specified but not drawn (Gate 02B).

| Width | Shell | Applications | Preview | Detail |
|---|---|---|---|---|
| ≥ 1680 | Sidebar 240 | Table with a subset of columns | Inline pane, 440px | Two columns: main + 380px rail |
| 1280–1679 | Sidebar 240 (collapsible to 64 with tooltips) | Full table | Drawer over the table (Space), focus trapped | Two columns |
| 1024–1279 | Sidebar collapsed to 64 | Table: Source hidden, Priority folded into the company cell | Drawer | Rail stacks under the header strip |
| 768–1023 | Top bar + navigation drawer | Condensed table (Company·Role, Stage, Next action) | Full route | Single column; right-rail sections become accordions below the timeline |
| < 768 | Mobile: header + 5-tab bottom bar | Card list (D10) | Full route | D11: segmented Timeline / Details / People, sticky action bar |

Rules:
- The table is never shrunk onto mobile; below 768px the card list is a separate component.
- Bulk selection on mobile starts with a long-press. A selection toolbar then replaces the tab bar.
- Filters on mobile open in a bottom sheet. Saved views scroll horizontally as chips.
- On mobile, the workspace chip is always in the header, and the switcher opens as a sheet.

## Transformations by element
| Element | Mobile | Tablet | Desktop | Wide desktop |
|---|---|---|---|---|
| Navigation | 5-tab bottom bar (Today · Apps · Tasks · Contacts · More) | 64px icon rail with tooltips, or a drawer below 1024 | 240px grouped sidebar | 240px grouped sidebar |
| Workspace switching | Header chip → bottom sheet | Rail top tile → menu | Sidebar top button → menu (D12) | Same |
| Applications table | Card list (D10) | Condensed table (3–5 columns) | Full table (D3) | Table with a subset of columns + preview (D5) |
| Filters | Filter button → bottom sheet; view chips scroll horizontally | Chips, with extras collapsed into "More" | Chips row | Chips row |
| Bulk actions | Long-press to select → toolbar replaces the tab bar | Bulk bar | Bulk bar | Bulk bar |
| Preview pane | Full route | Drawer | Drawer (Space) | Inline 440px |
| Application detail | Segmented Timeline / Details / People + sticky actions (D11) | Single column; rail sections become accordions | Two columns + 380px rail (D7) | Same as desktop |
| Timeline | Stacked rows, 28px icons, date on the right | Date-grouped | Date-grouped with filter chips (D7) | Same |
| Owner filter (manager) | In the filter sheet | Chip | Chip + listbox (D13) | Same |
