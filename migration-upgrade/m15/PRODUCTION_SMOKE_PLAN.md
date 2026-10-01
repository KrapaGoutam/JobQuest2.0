# Milestone 15 — Production Smoke Plan: Historical Reference

**Status**: **OBSOLETE — CREDENTIAL REDACTED; NOT AUTHORIZED FOR REUSE**

**Milestone**: Milestone 15 — Production Launch & Cutover

**Historical Environment**: Superseded Supabase project `kwmnljvyvqvbvimypnmw` (inaccessible)

**Current Production**: `jobquest-prod` (`kqsxdothjxtcktyirpux`), a separate environment

---

## 1. Historical smoke identity

A temporary smoke-test identity was previously documented for the superseded environment. Its current account state and credential validity cannot be verified because that historical project is inaccessible.

| Attribute | Historical record | Required handling |
| --- | --- | --- |
| **Account** | Historical smoke-test account | Do not test, reuse, recreate, or migrate it into current Production |
| **Password** | [REDACTED — obsolete historical smoke-test credential] | Current validity remains `UNKNOWN`; redaction does not invalidate it |
| **Environment** | Superseded project `kwmnljvyvqvbvimypnmw` | No access or mutation is authorized |
| **Git history** | Historical exposure metadata is retained by commit/path only | No history rewrite is authorized in PL-1A |

The current Production user is `Conan`. The historical smoke-test account is absent from current Production and must not be created there as part of PL-1A.

---

## 2. Historical smoke-flow scope

The obsolete plan covered these conceptual checks:

1. Health probe.
2. Authentication.
3. Workspace isolation.
4. Synthetic application creation.
5. Stage transition.
6. Career-journal creation.
7. Global search.
8. Extension facade.
9. Synthetic cleanup.

This list is retained only as non-secret planning history. It does not authorize running the historical account or credential against any environment.

---

## 3. Future M15-F requirements

If an operator later authorizes Production smoke testing during M15-F, the smoke identity must be:

- newly created for that authorized task;
- temporary and minimally privileged;
- isolated from real user records;
- provisioned with a completely new credential;
- supplied through an approved secret channel at runtime; and
- removed or disabled according to the operator-approved cleanup plan.

The new credential must never be stored in Git, repository documentation, prompts, fixtures, scanner configuration, or CI output.

Production remains frozen until the separate M15-F authorization gate.
