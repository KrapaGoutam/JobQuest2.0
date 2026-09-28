# Design tokens (approved baseline)

## Approved semantic tokens — as used in `approved/`
| Semantic token (brief name) | Mockup alias | LIGHT | DARK | Use |
|---|---|---|---|---|
| --color-canvas | --bg | #f6f7f9 | #090d16 | Page background |
| --color-sidebar | --sidebar | #ffffff | #0d1220 | Sidebar |
| --color-surface-1 | --surface | #ffffff | #121827 | Cards, table, header |
| --color-surface-2 | --surface-muted | #f1f3f6 | #171f30 | Table header, banners, chips |
| --color-surface-3 | --surface-3 | #e8ebf0 | #202a3d | Avatars, selected segment |
| --color-text | --fg | #172033 | #edf1f7 | Primary text |
| --color-text-muted | --muted | **#5f6b7e** | #b1bbca | Secondary text (light value tightened from #667085) |
| --color-border | --border | #dfe3ea | #273247 | Dividers |
| --color-border-strong | --border-strong | #c7ced9 | #35425a | Control borders, inactive pips |
| --color-accent | --primary | #3157d5 | #8098ff | Primary actions, current nav, stage progress |
| --color-accent-hover | --primary-hover | #2849b8 | #9aacff | Hover |
| --color-on-accent | --primary-fg | #ffffff | #0b1030 | Text on accent |
| --color-accent-soft | --primary-soft | #e9edff | #202b58 | Selected rows, active chip |
| --color-focus | --focus | #5076f2 | #9ab0ff | Focus ring |
| --color-success | --success | #147a55 | #54c89a | Completed, manager badge |
| --color-warning | --warning | #9a5b08 | #edb457 | Due today, Follow-Up Recommended |
| --color-danger | --danger | #ba3341 | #ff7f8c | Overdue, Stale, Long Waiting, badges |
| --color-info | --info | #246b9f | #75b8e7 | Informational |
| --color-warning-soft (new) | --warning-soft | color-mix(warning 9%, surface) | same formula | Next-action panel, due-today band |
| --color-danger-soft (new) | --danger-soft | color-mix(danger 7%, surface) | same formula | Overdue band |
| --color-scrim (new) | --scrim | rgba(23,32,51,.32) | rgba(3,6,12,.6) | Behind menus/drawers |
| --shadow-popover (new) | --shadow | 0 12px 32px rgba(23,32,51,.16) | 0 16px 40px rgba(0,0,0,.5) | Menus, popovers |
| --workspace-accent (new, per workspace) | ws.color | e.g. oklch(0.52 0.13 265) | same | Sidebar edge, switcher tile, breadcrumb dot — never text |

- **Type:** system stack — Inter if installed, then ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif. No web fonts. Tabular numerals.
- **Type sizes:**
  - desktop: 13px base, 12px meta, 14px section titles, 22–24px page titles;
  - mobile: 15px base, 17px header, 21–22px titles.
- **Radius:** 6–7px controls, 8px cards and table, 10px menus, 12px mobile cards, 24–28px mobile device frame (presentation only).
- **Sizes:** desktop rows 44px, controls 32–36px, mobile targets ≥ 44px.

---

## History (exploration notes)

In turn 2, all three directions use the target tokens from `docs/UI_UX_DESIGN_BRIEF.md`. These are carried forward from DESIGN.md. Mockups use short aliases for them:

| Alias | Repo token | Light | Dark |
|---|---|---|---|
| --bg | --color-canvas | #f6f7f9 | #090d16 |
| --sidebar | --color-sidebar | #ffffff | #0d1220 |
| --surface | --color-surface-1 | #ffffff | #121827 |
| --surface-muted | --color-surface-2 | #f1f3f6 | #171f30 |
| --surface-3 | --color-surface-3 | #e8ebf0 | #202a3d |
| --fg | --color-text | #172033 | #edf1f7 |
| --muted | --color-text-muted | #667085 | #b1bbca |
| --border | --color-border | #dfe3ea | #273247 |
| --border-strong | --color-border-strong | #c7ced9 | #35425a |
| --primary | --color-accent | #3157d5 | #8098ff |
| --primary-hover | --color-accent-hover | #2849b8 | #9aacff |
| --primary-soft | --color-accent-soft | #e9edff | #202b58 |
| --focus | --color-focus | #5076f2 | #9ab0ff |
| --success / --warning / --danger / --info | same names | #147a55 / #9a5b08 / #ba3341 / #246b9f | #54c89a / #edb457 / #ff7f8c / #75b8e7 |

Two tokens are derived rather than taken from the brief: `--warning-soft` and `--danger-soft`, both made with color-mix against the surface colour. They are not in the brief; confirm or replace them.

Text uses `--color-text-muted`. `--color-text-subtle` (#7d8799 on white, about 3.9:1) is too low-contrast for body text.

**Type:** Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif. No network font is loaded. Numbers use tabular numerals. Base size is 14px; dense tables are 13px. Page titles are 18–28px. Direction C uses 800 weight and 40px for its hero title.

**Spacing:** a 4px scale. Controls are 32 or 36px tall.

**Radius:** A and B follow the brief: 6px controls, 8px cards, 10–12px dialogs. C uses 6–10px.

**Shadows:** only on the command palette and focus rings.

**Theme default:** A and B show light first. C shows dark first, which matches the shipped styles.css. The owner still needs to decide the default (see the brief).

## Direction D additions
- **Theme:** default is **System** (follows `prefers-color-scheme`), with **Light** as the fallback when the preference is unavailable. Options are System, Light and Dark. An explicit choice persists per user (legacy `applyTheme()` already supports "system"). The dark-first default in Direction C is not adopted.
- **Muted text:** light `--muted` is tightened from #667085 to **#5f6b7e** (about 5.3:1 on #f6f7f9) so 12px meta text passes AA on the canvas as well as on white. This needs to be carried back into the brief.
- **Workspace accent:** each workspace has a fixed colour, used only for the sidebar top edge, the switcher tile and the breadcrumb dot. It is never used for text.
- **Scrim:** light rgba(23,32,51,.32), dark rgba(3,6,12,.6).
- **Menu shadow:** light 0 12px 32px rgba(23,32,51,.16), dark 0 16px 40px rgba(0,0,0,.5).
- **Sizes:** desktop rows are 44px, controls 32–36px, and mobile targets at least 44px.
