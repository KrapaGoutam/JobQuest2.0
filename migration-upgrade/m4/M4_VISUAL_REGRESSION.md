# M4 — Visual Regression & UI Fidelity Report

> **M4 closeout (2026-09-25):** corrected during the final consistency audit. Canonical roles are `USER` / `MANAGER`; refresh tokens use a SHA-256 verifier (Argon2id is for passwords and recovery codes); contacts are archive-first (no hard delete); interactions are append-only; manager cross-user mutations are audited in `audit_events`. See `M4_COMPLETION_REPORT.md` §3 for the full list of corrections.

**Capture Tool:** `e2e/m4-contacts.spec.ts` (Playwright / Chromium).
**Source:** Local execution against full seeded database fixtures.
**Location:** `migration-upgrade/m4/screenshots/`

---

## 1. Screenshot Inventory & Gate 02B Review

| Filename | Viewport | Target Component / State | Visual Review against Direction D / Gate 02B Specifications |
|---|---|---|---|
| `contacts-list-light.png` | 1440×900 | Contacts Table (Light Mode) | **PASS**: 44px row density, avatar initials with color accents, company badge, relationship pills (`RECRUITER`, `REFERRAL`, `HIRING_MANAGER`, `PEER`), follow-up status badges, action icons. Meets Gate 02B §4. |
| `contacts-list-dark.png` | 1440×900 | Contacts Table (Dark Mode) | **PASS**: Calibrated dark theme tokens (`data-theme="dark"`), `#121827` surface background, zero visual artifacts, full WCAG 2.2 AA contrast compliance. |
| `contact-create.png` | 1440×900 | Create Contact Modal | **PASS**: Centered dialog overlay, clear label associations, company auto-complete dropdown, LinkedIn URL validation, relationship selector chips, follow-up date picker. |
| `contact-detail.png` | 1440×900 | Contact Detail Drawer (2-Column) | **PASS**: Slide-in drawer matching Gate 02B `03-contacts.html`. Left column: interaction activity & quick log. Right column: contact info and linked applications count. The networking checklist was removed at closeout (it showed fabricated, unsaved progress); screenshot re-captured. |
| `contact-interaction-history.png` | 1440×900 | Interaction Timeline | **PASS**: Chronological interaction cards with type icons (Email, Call, Meeting, LinkedIn), formatted relative dates, actor attribution, and notes display. |
| `contacts-manager-view.png` | 1440×900 | Manager View (Workspace Scope) | **PASS**: Manager sees contacts across all team members in the workspace. Contact owner initial chips displayed in table and header statistics. |
| `contacts-mobile.png` | 375×812 | Mobile Responsive Viewport | **PASS**: Desktop table transitions seamlessly to touch-friendly card stack. Min 44px tap targets. Zero horizontal scroll overflow (measured width: 375px). |

---

## 2. Gate 02B Design System Compliance

1. **Typography & Layout Tokens:**
   - Strict adherence to `apps/web/src/styles/tokens.css`.
   - Typography uses system font stack (Inter / sans-serif) with tabular numerals for counts and dates.
   - Row heights standard at 44px with 8px gutters and standard radii (`--radius-sm: 6px`, `--radius-md: 7px`).

2. **Overlay Stacking Order:**
   - Detail drawer uses the shared shell layers (drawer scrim 50, drawer 60; M3 dialog scrim 65, dialog 70).
   - The M4 Create Contact / Log Interaction / Link Application modals set an inline `z-index: 1000`, which puts them above the drawer but outside the token scale (follow-up item).
   - Managed via the established `useOverlay` hook, ensuring escape keys and focus traps operate hierarchically without layering bugs.

3. **Status Badges & Relationship Colors:**
   - `RECRUITER`: Information blue (`--color-info-soft`).
   - `REFERRAL`: Primary accent purple (`--color-accent-soft`).
   - `HIRING_MANAGER`: Warning amber (`--color-warning-soft`).
   - `PEER`: Success teal (`--color-success-soft`).
   - Follow-up alerts: Warning yellow for due today; Danger red for overdue (> 0 days).

---

## 3. Pre-existing M2 Shell Observations

The non-blocking shell observations noted during M2 and M3 remain preserved and untouched to ensure zero regressions in the shared application frame:
- Topbar breadcrumb and avatar remain stacked as in M2 baseline.
- Workspace switcher remains operational.
- Global navigation correctly routes to `/contacts` with the Contacts tab actively highlighted in the sidebar.

---

## 4. Accessibility Audit Summary

Audited with axe-core (WCAG 2.0, 2.1, 2.2 Level A and AA):
- `contacts-list-initial`: **0 critical, 0 serious, 0 moderate, 0 minor**
- `contact-create-modal`: **0 critical, 0 serious, 0 moderate, 0 minor**
- `contact-detail-drawer`: **0 critical, 0 serious, 0 moderate, 0 minor**
- `contacts-mobile-layout`: **0 critical, 0 serious, 0 moderate, 0 minor**

All color contrast ratios exceed 4.5:1 for body text and 3.0:1 for large text / UI borders across both light and dark themes.
