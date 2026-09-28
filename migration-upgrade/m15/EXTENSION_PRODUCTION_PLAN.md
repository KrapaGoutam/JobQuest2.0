# Milestone 15 — Browser Extension Production Plan: Distribution & Origin

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED (ZERO EXTENSIONS PUBLISHED)**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Package**: `@jobquest/extension` (Manifest V3 Chrome Extension)

---

## 1. Extension Production Configuration & Origin

The Chrome extension must be repointed from local/preview endpoints to the permanent production origin:

### 1.1 Origin Binding
- **API Base URL**: `https://<PRODUCTION_DOMAIN>/api/ext/v1`
- **Manifest Permissions (`manifest.json`)**:
  ```json
  "host_permissions": [
    "https://<PRODUCTION_DOMAIN>/*",
    "https://www.linkedin.com/jobs/*",
    "https://www.indeed.com/viewjob*",
    "https://*.greenhouse.io/*",
    "https://jobs.lever.co/*"
  ]
  ```
- **Deep-Link Origin**: `https://<PRODUCTION_DOMAIN>/#/applications/:id`

---

## 2. Packaging & Two-Phase Distribution Strategy

Chrome Web Store (CWS) reviews typically take 2 to 5 business days. To avoid delaying production cutover, JobQuest 2.0 adopts a two-phase distribution strategy:

```
[Phase 1: Cutover Day] ────────► Developer Mode Zip Distribution (Immediate User Verification)
         │
         ▼
[Phase 2: Post-Cutover] ───────► Chrome Web Store Official Submission (Store Listing)
```

### 2.1 Phase 1: Immediate Unpacked Zip Package (Cutover Day)
1. Build production extension package:
   ```bash
   pnpm --filter @jobquest/extension build
   ```
2. Verify extension bundle contains 0 secrets:
   ```bash
   node scripts/check-bundle.mjs --extension
   ```
3. Create distribution zip archive:
   ```bash
   cd apps/extension/dist && zip -r ../../../jobquest-extension-v2.0.0.zip . && cd ../../..
   ```
4. Users install immediately via Chrome → Extensions → Developer mode → "Load unpacked" or drag zip.

### 2.2 Phase 2: Chrome Web Store Submission
1. Register Chrome Web Store developer account ($5 one-time fee, `M15-D16`).
2. Upload `jobquest-extension-v2.0.0.zip`.
3. Provide single-purpose justification: *"JobQuest 2.0 Job Capture tool allowing job seekers to save job listings directly into their private JobQuest workspace."*
4. Store listing publishes upon Google review approval.

---

## 3. Token Generation & Session Management

- **Extension Token Architecture**:
  - Generated inside the web app at `/#/settings/extension`.
  - Format: `jqx_live_<43_random_chars>`.
  - Stored hashed with SHA-256 + secret pepper in `public.extension_tokens`.
  - Scoped strictly to the active workspace.
- **Revocation**: Users can revoke tokens at any time from the web application settings.
