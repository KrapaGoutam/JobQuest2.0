# M9 Visual Regression — Dashboard Parity

Target: local application against local Supabase. Preview recapture is pending Vercel re-authentication.

Executable/test SHA: `de220e8c7fa6934b4bf905915d2f47ebcf065248`

## Captures

| File | Coverage |
| --- | --- |
| `D1-dashboard-light.png` | Direction D queue plus manager default three-tier dashboard in light mode |
| `D2-customize-dialog.png` | 30-entry customization surface, enabled state, reordered widgets, two-column width, keyboard focus |
| `D3-dashboard-dark.png` | Customized tier/widget rendering in dark mode |
| `D4-dashboard-mobile.png` | 390x844 action-first mobile layout with zero horizontal overflow |

All captures were inspected. Cards, hierarchy, typography, controls, theme contrast, and responsive stacking remain coherent. The dialog exposes a scrollable dense registry without escaping its modal bounds. Transient success toasts are dismissed before deterministic captures.

Automated axe audits cover light dashboard, customization dialog, dark dashboard, and mobile dashboard. Each reports 0 critical, 0 serious, and 0 blocking violations.

Preview captures and comparison are not claimed: no M9 Vercel Preview could be created or inspected because both available Vercel auth paths require re-authentication to the linked team scope.
