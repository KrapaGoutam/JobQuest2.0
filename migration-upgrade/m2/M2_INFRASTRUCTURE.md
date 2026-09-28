# Milestone 2 — Infrastructure Report

## 1. Vercel Project & Deployment Status
- **Vercel Account Verified:** YES (`goutamkrapa11-8565`)
- **Team / Organization:** `one-piece-5779` (OnePiece, plan: `hobby`)
- **Project Name:** `jobquest2` (Project ID: `prj_0A32SVkbOH2fBI2XLFv7kSkv086d`)
- **Repository Linked:** YES (`one-piece-5779/jobquest2`)
- **Active Preview Deployment:**
  - URL: `https://jobquest2-ltdqwm6m5-one-piece-5779.vercel.app`
  - Inspector: `https://vercel.com/one-piece-5779/jobquest2/8jLURyLCSbMghHGwF82aYBwm7Q6Z`
  - Ready State: `READY`
  - Target: `Preview` (Non-production)
- **SSO Deployment Protection:** `Disabled` (allows preview access and automated Playwright testing without authentication redirects)

## 2. Supabase Integration
- **Dev Project Reference:** `xpnkasclquplmrcmhsif` (`jobquest-dev`)
- **Supabase Region:** `us-east-1`
- **Signing Key Architecture:** Option B (App-owned ES256 keypair; public key trusted in Supabase dashboard)
- **Signing Key Rotation:** Not required / preserved intact from M1B
- **Production Supabase Project:** NONE (Explicitly deferred until production cutover)

## 3. Environment Variables (NAMES ONLY)
All environment variables are configured on Vercel for `Preview` and `Development` environments:

### Browser Safe (Config)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Server Only (Secrets)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `JQ_JWT_PRIVATE_JWK`
- `JQ_JWT_ISSUER`
- `APP_ORIGINS`
- `NODE_OPTIONS` (`--experimental-require-module`)

## 4. Secret Hygiene
- **Private Secrets Committed to Git:** NO
- **Private Signing JWK in Client Bundle:** NO (Verified via `pnpm check:bundle`)
- **Service Role Key in Client Bundle:** NO (Verified via `pnpm check:bundle`)
- **Committed `.env` Files:** NO (Verified via git audit & CI pre-flight)
- **`.vercelignore` Configured:** YES (Prevents accidental uploads of local keys, `.env*`, `supabase/`, and test artifacts)
- **JobQuest 1.0 Touched:** NO (Directory `../JobQuest1.0/` remains strictly READ ONLY)
- **Production Release Created:** NO (Only Preview deployments exist)
