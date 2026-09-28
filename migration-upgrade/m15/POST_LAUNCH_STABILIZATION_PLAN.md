# Milestone 15 — Post-Launch Stabilization Plan: 14-Day Monitoring

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Stabilization Window**: 14 Days Post-Cutover  
**Legacy Invariant**: JobQuest 1.0 remains in read-only standby; retirement requires separate post-stabilization authorization (`M15-D20`)

---

## 1. Stabilization Window Objectives & Timeline

The 14-day post-launch stabilization phase guarantees continuous platform stability, rapid anomaly detection, and supported user onboarding:

```
[Day 0: Cutover] ────► [Days 1–3: High Alert] ────► [Days 4–7: Onboarding] ────► [Days 8–14: Steady State]
                                                                                          │
                                                                                          ▼
                                                         [Post-Stabilization Review: JobQuest 1.0 Retirement]
```

### 1.1 Cadence & Milestones
- **Days 1–3 (High Alert)**:
  - Hourly inspection of Vercel serverless function execution logs and HTTP 5xx error rates.
  - Continuous monitoring of Supavisor connection pool metrics (active vs idle connections).
  - Rapid triage of any authentication or claim code redemption issues.
- **Days 4–7 (Onboarding & Parity Verification)**:
  - Track claim code redemptions across all migrated legacy users.
  - Verify legacy users successfully access historical applications, contacts, and journal entries.
- **Days 8–14 (Steady State & Performance Tuning)**:
  - Confirm automated hourly `pg_cron` cleanup of `public.auth_rate_limits`.
  - Validate Core Web Vitals on live production traffic (LCP $< 1.0\text{s}$, INP $< 50\text{ms}$).
- **Day 15+ (Post-Stabilization Signoff)**:
  - Conduct final platform health review.
  - Present user with explicit decision prompt for JobQuest 1.0 decommissioning (`M15-D20`).

---

## 2. Telemetry, Metrics & Alerting Thresholds

| Metric | Target Normal | Warning Threshold | Critical Incident Threshold |
| --- | --- | --- | --- |
| **HTTP 5xx Error Rate** | $0.00\%$ | $> 0.10\%$ | $> 1.00\%$ |
| **API Health Latency** | $< 120\text{ms}$ | $> 250\text{ms}$ | $> 1000\text{ms}$ (or timeout) |
| **Supavisor Connections** | $< 30$ active | $> 80$ active | $> 150$ active (connection exhaustion risk) |
| **Auth Login Failures** | $< 1\%$ normal | $> 5\%$ | $> 15\%$ (credential stuffing or token defect) |
| **Database Disk Usage** | $< 1\text{GB}$ | $> 4\text{GB}$ | $> 7\text{GB}$ (approaching 8GB limit) |

---

## 3. Option B Claim Code Distribution & Support Runbook

1. **Out-of-Band Delivery**:
   - Claim codes are delivered directly to legacy users via private, authenticated channels (e.g. encrypted email or direct messaging).
   - Text template:
     > *"Welcome to JobQuest 2.0! Your historical data has been securely migrated to your new dedicated workspace. To claim your account, navigate to https://<PRODUCTION_DOMAIN>/#/claim and enter your single-use claim code: `[CODE]`. You will establish your new password upon redemption."*
2. **Re-issuance / Loss Procedure**:
   - If a user misplaces an unclaimed code, an operator can generate a replacement claim code using the administrative RPC: `rpc_reissue_claim_code(legacy_user_id)`.
   - The prior code is marked `expired` immediately.

---

## 4. JobQuest 1.0 Retirement Boundary & Guardrail

> [!CAUTION]
> **JOBQUEST 1.0 RETIREMENT IS NOT AUTHORIZED IN MILESTONE 15.**
> - JobQuest 1.0 database (Neon) and web service (Render) must remain running in read-only standby throughout the entire 14-day stabilization window.
> - Decommissioning of JobQuest 1.0 infrastructure will take place **ONLY** after the user issues a separate, explicit authorization at the conclusion of Phase M15-F.
