# Milestone 15 — Phase E: Production Extension Package Report

**Milestone**: Milestone 15 — Production Launch & Cutover  
**Phase**: Phase M15-E — Browser Extension Production Package Validation  
**Status**: **PACKAGED, VERIFIED & PRODUCTION READY (SIDELOAD DEPLOYMENT)**  
**Date**: September 28, 2026  
**Target Canonical Origin**: `https://jobquest2.vercel.app`  

---

## 1. Extension Package Artifact

The production extension package has been compiled and packaged for direct sideload installation:

| Attribute | Value |
| --- | --- |
| **Package File** | `apps/extension/dist/jobquest-capture-prod.zip` |
| **File Size** | 74,272 bytes |
| **SHA-256 Checksum** | `17858d2a1419715a80cf48247760c44121c9e1058ca547c1708844dfaa7c5dc5` |
| **Manifest Version** | Manifest V3 |
| **Instance Preset** | `https://jobquest2.vercel.app` (`instance-preset.json`) |
| **Store Publication** | **NOT PUBLISHED** (Maintained strictly as sideload per project constraints) |

---

## 2. Test Verification & Code Quality

- **Unit Test Suite**: 27/27 tests passed (`pnpm --filter @jobquest/extension test`)
  - Content script parser tests: 10/10 passed (LinkedIn, Greenhouse, Lever, Workday)
  - Duplicate detection logic: 5/5 passed
  - Token storage and lifecycle: 6/6 passed
  - UI state and capture flow: 6/6 passed
- **TypeScript Compilation**: Clean (0 errors)
- **Bundle Secret Audit**:
  - Total files scanned in archive: 40
  - Forbidden secret patterns detected: 0
  - Default preset URL: Locked to `https://jobquest2.vercel.app`

---

## 3. End-to-End Production API Verification

The packaged extension interfaces with JobQuest 2.0 via Bearer Token authentication. All 6 extension endpoints were verified against the live production origin `https://jobquest2.vercel.app`:

```
POST /api/extension/tokens              -> HTTP 201 Created (Token minted with 5 scopes)
GET  /api/ext/v1/me                    -> HTTP 200 OK (Actor, workspace, scopes, expiry verified)
GET  /api/ext/v1/workflow              -> HTTP 200 OK (8 stages, 2 statuses, 2 outcomes)
GET  /api/ext/v1/documents?kind=resume -> HTTP 200 OK (0 resumes found, schema valid)
POST /api/ext/v1/duplicates/check      -> HTTP 200 OK (Match type: NONE, no duplicate)
POST /api/ext/v1/captures              -> HTTP 201 Created (RPC ingestion successful)
POST /api/extension/tokens/:id/revoke  -> HTTP 200 OK (Token revoked: true)
```

---

## 4. Operator Sideload Installation Instructions

To install the production extension package in any Chromium-based browser (Google Chrome, Brave, Microsoft Edge):

1. Unzip `apps/extension/dist/jobquest-capture-prod.zip` to a local folder (e.g. `dist/jobquest-capture-prod/`).
2. Open the browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the unzipped folder containing `manifest.json`.
6. Click the extension icon in the browser toolbar:
   - The preset URL `https://jobquest2.vercel.app` will be pre-configured.
   - Click **Connect** to authenticate via your JobQuest 2.0 account.
   - Authorize the token to begin 1-click job captures.
