# Milestone 15 — Production Secrets & Key Custody Plan

**Status**: **PROPOSED — PRE-FLIGHT VERIFIED (ZERO PRODUCTION SECRETS SET)**  
**Milestone**: Milestone 15 — Production Launch & Cutover  
**Branch**: `feature/m15-production-launch-cutover`  
**Security Standard**: AES-256 encrypted at rest, write-only UI custody, zero client leakage

---

## 1. Production Secrets Inventory & Scope Classification

To ensure zero accidental exposure, every production variable is categorized by execution scope and sensitivity:

| Secret / Config Variable Name | Target Scope | Exposure Classification | Storage Location | Invariant / Governance Rule |
| --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Web Browser Client | Public / Non-Sensitive | Vercel Environment Variables | Public HTTPS endpoint for Supabase project |
| `VITE_SUPABASE_ANON_KEY` | Web Browser Client | Public / Low Sensitivity | Vercel Environment Variables | Standard Supabase anon JWT; RLS enforces row isolation |
| `SUPABASE_SERVICE_ROLE_KEY` | Serverless Node API | **CRITICAL SERVER-ONLY** | Vercel Sensitive Environment Variable | **NEVER** expose to Vite/browser; bypasses RLS |
| `SUPABASE_DB_URL` | Serverless / Tooling | **CRITICAL SERVER-ONLY** | Vercel Sensitive Environment Variable | Direct pooler connection string (Port 5432, Supavisor) |
| `SUPABASE_JWT_PRIVATE_KEY` | Serverless Node API | **CRITICAL SERVER-ONLY** | Vercel Sensitive Environment Variable | Asymmetric ES256 NIST P-256 private key for Option B auth |
| `SUPABASE_JWT_PUBLIC_KEY` | Supabase Cloud Auth | Server Configuration | Supabase Dashboard (Auth JWT Settings) | Public key verifying token signatures in PostgREST |
| `EXTENSION_TOKEN_PEPPER` | Serverless Node API | **CRITICAL SERVER-ONLY** | Vercel Sensitive Environment Variable | 256-bit CSPRNG pepper hashing extension API tokens |
| `VITE_APP_ENV` | Web Browser Client | Public / Non-Sensitive | Vercel Environment Variables | Set to `production` |

---

## 2. ES256 Asymmetric Key Pair Generation Runbook

During Phase M15-B (Infrastructure Provisioning), a brand-new, production-dedicated cryptographic key pair will be generated. The development key used on `jobquest-dev` will **never** be used in production.

### 2.1 Generation Command
```bash
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
console.log('PUBLIC_KEY:\n' + publicKey);
console.log('PRIVATE_KEY:\n' + privateKey);
"
```

### 2.2 Secure Custody
1. **Public Key**:
   - Uploaded into Supabase Production Project → Project Settings → Authentication → JWT Settings → Add New Verification Key (`ES256`).
   - Retained as the active signing key.
2. **Private Key**:
   - Copied directly into Vercel Project Settings → Environment Variables.
   - Key name: `SUPABASE_JWT_PRIVATE_KEY`.
   - Environment target: **Production only**.
   - Checkbox: **Mark as Sensitive** (write-only; obscured from build logs and team members).
   - The private key is never written to disk or committed to version control.

---

## 3. Secret Leakage Defenses & Verification

JobQuest 2.0 employs automated 4-tier secret auditing to prevent credentials from ever reaching production client bundles:

1. **Pre-Commit / Pre-Push Scan**:
   - Rule-based structure scanner: `node scripts/check-bundle.mjs --tracked`
   - Scans all 846 tracked files for private key headers, service role tokens, and connection strings.
2. **Post-Build Bundle Scan**:
   - `node scripts/check-bundle.mjs`
   - Unpacks `dist/` and inspects client chunks for embedded server variable names or credentials.
3. **Extension Package Scan**:
   - `node scripts/check-bundle.mjs --extension`
   - Verifies extension distribution manifest, background workers, and content scripts.
4. **Live Deployment Asset Scan**:
   - `node scratch/scan-preview-bundle.mjs`
   - Fetches live HTML and JavaScript chunks from Vercel Edge CDN and audits via AST and regex rules.

---

## 4. Key Rotation & Disaster Recovery Procedure

If a secret is ever suspected of compromise:
1. **JWT Key Rotation**:
   - Generate a new ES256 key pair.
   - Add new public key to Supabase Auth settings while leaving previous key in `Previously Used` list (ensuring existing active sessions remain valid during transition).
   - Update `SUPABASE_JWT_PRIVATE_KEY` in Vercel.
   - Redeploy Node API. After 24 hours (token expiration window), remove old public key from Supabase.
2. **Service Role Key Rotation**:
   - Rotate service role key in Supabase Dashboard.
   - Immediately update `SUPABASE_SERVICE_ROLE_KEY` in Vercel Sensitive Environment Variables.
   - Trigger production redeploy (`vercel --prod`).
