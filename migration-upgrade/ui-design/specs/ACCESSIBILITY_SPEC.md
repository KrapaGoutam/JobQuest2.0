# Accessibility spec (Direction D) — target WCAG 2.2 AA, light and dark

## Contrast
- **Body text:** `--fg` on `--surface` or `--bg` is at least 12:1 in both themes. `--muted` is at least 4.5:1 (light #5f6b7e, dark #b1bbca).
- **State colours:** `--danger`, `--warning` and `--primary` used as text are at least 4.5:1 on surface in both themes. Verify with an automated check at Gate 02B.
- **Tinted backgrounds:** the soft backgrounds (warning-soft, danger-soft, primary-soft) keep `--fg` text contrast at or above 4.5:1.

## Never colour alone
Stage uses pips plus a label; aging uses an icon plus a label; priority uses bars plus a text label; overdue uses an icon plus "Nd overdue".

## Patterns
- **Applications table:** ARIA `grid` with `aria-rowcount` (virtualized), `aria-sort` on the sorted column, `aria-selected` on rows, and roving tabindex. Keys: ↑/↓ move, X selects, Shift+X selects a range, Space opens the preview, Enter opens the application, `/` jumps to search.
- **Bulk bar:** `role="toolbar"`. The selection count is announced through a polite live region.
- **Saved views and detail tabs:** the full ARIA tabs pattern (CR-003 resolved). Tabs only for long-form groups; panels are really switched, not stacked.
- **Preview drawer and workspace/owner menus:** a focus trap, Esc to close, and focus returned to the trigger.
- **Workspace switcher:** `menuitemradio` with `aria-checked`. The trigger's label includes the workspace name and role.
- **Stale review actions:** plain buttons. "Mark Ghosted" and "Archive" can be undone with a 10-second toast. Hard delete needs a separate confirm dialog.
- **Timeline:** an ordered list grouped by date headings. "Show earlier" is a button, and new items are announced.
- **Touch and focus:** mobile targets are at least 44×44px. Desktop controls are at least 32px high, with 24px minimum targets per WCAG 2.2 SC 2.5.8. Focus rings are 2px `--focus` with a 2px offset, visible in both themes.
- **Motion and theme:** `prefers-reduced-motion` is honoured, and theme System follows `prefers-color-scheme` live.
