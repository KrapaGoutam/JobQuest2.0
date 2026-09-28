# Milestone 7 · Visual Regression & UI Verification

**Milestone:** M7 — Documents & Resumes  
**Target Designs:** Gate 02B R1 (`Resumes List`) and R2 (`Compare Versions`)  
**Design System:** Direction D (Tailored Dark/Light, Tokens, M2 Accessible Components)  
**Execution Date:** 2026-09-25  

---

## 1. Generated Visual Artifacts

The automated Playwright E2E suite (`e2e/m7-documents.spec.ts`) captured 4 high-resolution visual evidence artifacts under `migration-upgrade/m7/screenshots/`:

| Screenshot | Description | Gate 02B Mapping |
| :--- | :--- | :--- |
| `R1-resumes-light.png` | Resumes & Documents table view in Light Mode showing stats cards, tabs, and action menus. | Gate 02B Screen R1 |
| `R1-resumes-dark.png` | Resumes & Documents table view in Dark Mode validating token consistency, contrast, and badge colors. | Gate 02B Screen R1 |
| `R2-compare-versions.png` | Side-by-side comparison matrix of two resume versions with metrics (Response rate, Interviews, Offers) and sample size guidance. | Gate 02B Screen R2 |
| `m7-application-documents-drawer.png` | Application Detail Drawer showing the Documents section with primary resume version and action controls. | Gate 02B App Drawer |

---

## 2. Gate 02B Specification Compliance

### A. Screen R1 — Resumes & Documents List
- **Header & Metrics:** Total documents, Active variants, Overall application response rate, and default document callout.
- **Tab Filtering:** `All active`, `Resumes`, `Cover letters`, and `Archived` filters with count badges.
- **Data Table Elements:**
  - Document Title & Target Role.
  - Document Type badge (`Resume` in accent, `Cover Letter` in purple).
  - Version label pill (`v1.0`, `v1.1`, etc.).
  - Default indicator badge (`★ Default`).
  - Response Rate & Pipeline metrics (`N apps`, `X% response`).
  - Updated timestamp.
  - Contextual action menu (`Clone / Revision`, `Edit`, `Archive / Restore`, `Delete`).
- **Guarded Action Notifications:** When attempting to delete a document currently referenced by an active application, an inline error toast warns the user and blocks destructive deletion.

### B. Screen R2 — Compare Versions View
- **Side-by-Side Selectors:** Accessible dropdown controls (`aria-label` equipped) allowing instant comparison between any two variants or revisions.
- **Comparison Matrix Attributes:**
  - Target Role.
  - Category.
  - Document Type.
  - Default Version flag.
  - Total Applications linked.
  - Interview count and rate.
  - Offer count.
  - Rejection count.
  - Revision Changelog / Summary.
- **Statistical Significance Callout:** Callout banner informing the user when sample sizes differ or are too small to draw conclusive A/B test results.

### C. Application Detail Drawer Integration
- **Section Heading:** "Documents · N" with a count pill matching M5/M6 drawer patterns.
- **Actions:** "+ Attach" button launching modal to link existing resumes or cover letters.
- **Document List Item:** Displays title, version label, type badge, and an unlink button with confirmation.
