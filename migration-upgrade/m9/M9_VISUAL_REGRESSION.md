# M9 Visual Regression — Dashboard Parity

Target: Vercel Preview against hosted development Supabase.

Product SHA: `17be90a25239aa6491f1f35c6a8e5813f8854a7e`

Evidence SHA: `49960c3918f2703d9ce6f1ea6b857afd21deea2c`

Deployment: `dpl_7NfhxLDPHxb1Y1VsWETq16jjjPhh`

## Captures

| File | Coverage |
| --- | --- |
| `D1-dashboard-light.png` | Direction D queue plus manager default three-tier dashboard in light mode |
| `D2-customize-dialog.png` | 30-entry customization surface, enabled state, reordered widgets, two-column width, keyboard focus |
| `D3-dashboard-dark.png` | Customized tier/widget rendering in dark mode |
| `D4-dashboard-mobile.png` | 390x844 action-first mobile layout with zero horizontal overflow |

All captures were inspected. Cards, hierarchy, typography, controls, theme contrast, and responsive stacking remain coherent. The dialog exposes a scrollable dense registry without escaping its modal bounds. Transient success toasts are dismissed before deterministic captures.

Automated axe audits cover light dashboard, customization dialog, dark dashboard, and mobile dashboard. Each reports 0 critical, 0 serious, and 0 blocking violations.

All four captures were regenerated from the final Preview and visually reviewed. No clipping, overlap, modal-boundary escape, contrast regression, or horizontal overflow was observed. Axe reported zero critical, serious, or blocking violations in every captured context.
