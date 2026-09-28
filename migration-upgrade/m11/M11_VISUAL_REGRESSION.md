# M11 Visual Regression

Final target: `https://jobquest2-4s4ifimlx-one-piece-5779.vercel.app`
Executable SHA: `a49399ea59dd055c4af1887c857342913d166a07`

## Captures

| File | Coverage |
| --- | --- |
| `m11-popup-unconfigured.png` | Fresh-install setup state and keyboard entry point |
| `m11-options-connected-dark.png` | Connected options page, safe status, dark theme |
| `m11-popup-ready-dark.png` | Extracted job, canonical workflow and editable capture form |
| `m11-popup-capture-success.png` | Successful atomic capture and View in JobQuest action |
| `m11-popup-exact-duplicate-dark.png` | Authorized exact-match warning and safe existing-record action |
| `m11-popup-revoked-dark.png` | Immediate revoked-token rejection and recovery path |

The final Preview run regenerated the connected, ready, success, exact-duplicate, and revoked states from the real unpacked extension. Six axe audits reported 0 critical, 0 serious, and 0 blocking violations.

Keyboard focus, status announcements, labels, theme persistence, no horizontal overflow in extension surfaces, and the repaired dark primary-button contrast were exercised by automated assertions and visual inspection.
