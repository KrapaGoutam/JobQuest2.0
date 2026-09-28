# Milestone 11 - Browser Extension Migration Implementation Notes

Executable SHA: `a49399ea59dd055c4af1887c857342913d166a07`

## Security and API boundary

- Extension credentials use `jqx_<env>_<random>` secrets generated with a CSPRNG and verified with HMAC-SHA256 plus `EXTENSION_TOKEN_PEPPER`.
- The raw secret is returned only at creation/rotation. The database stores only a verifier and a 12-character operational prefix with a non-secret discriminator.
- Authenticated clients can read only safe token metadata. Direct access to `token_hash` is denied and covered by integration tests.
- Every extension request rechecks token expiry/revocation, fixed scopes, account state, and current workspace membership.
- `/api/ext/v1/me`, `/workflow`, `/documents`, `/duplicates/check`, and `/captures` are isolated from the normal web-session boundary.
- Duplicate states remain `EXACT_POSTING`, `SAME_ROLE`, `COMPANY_ONLY`, `NONE`, and `CHECK_ERROR`; an error is never presented as a clean result.
- Capture is server-owned and atomic: application, immutable posting snapshot, `CAPTURED` event, approved workflow action, notes/applied date, and optional resume association are committed together or rolled back.

## Web and extension delivery

- Settings provides owner-private token creation, one-time reveal/copy, safe metadata, expiry, last-used state, rotation, and revocation.
- The migrated extension uses Manifest V3, a service worker, content-script injection, strict CSP, minimal required permissions, and `chrome.storage.local` only.
- Workflow stages and document choices are loaded from JobQuest. Presentation labels are not sent as database stages.
- Secure links are composed only from the configured validated origin and API-returned workspace/application IDs.
- System, Light, and Dark themes use the JobQuest Direction D visual language.
- The verified legacy extraction source contains six HTML fixtures and 11 named extractor cases, all passing unchanged in JobQuest 2.0. The earlier planning estimate of 16 fixtures was not used as evidence.

## Corrections found during verification

- Authenticated direct verifier-column access was removed while safe metadata listing remained available.
- Token prefixes were expanded to be operationally distinguishable without exposing secret material.
- Comma-separated salary parsing was corrected so values such as `USD 195,000` are preserved.
- Dark primary-button contrast was raised after axe found a 4.16:1 combination.
- CI now packages and scans the unpacked extension before browser tests.
- The M10 regression fixture now derives its applied date from the current database day instead of a stale literal.

## Checkpoints

- API/security: `717e33dcae9aa57ef26a40e7d7382761d8b66108`
- Web/extension: `6784fc59bde7cc77fb74a917b1c75d8e301e0b0e`
- Initial browser verification: `3b9b3970fa579269852ab42b561a04b26d46b4fd`
- Hosted lifecycle verification: `e4799e01067a88c8c1eecd46595ab64c13dc3330`
- Final executable/CI hardening: `a49399ea59dd055c4af1887c857342913d166a07`
