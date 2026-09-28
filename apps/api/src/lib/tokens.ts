import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, importJWK, jwtVerify, type CryptoKey, type JWK, type JWTPayload } from 'jose';
import { env } from '../env';

/**
 * Option B access tokens: short-lived ES256 JWTs minted by the Node API and verified by
 * the Supabase Data API with the project's trusted signing key.
 *
 * Claim contract (gate-03/GATE_03_AUTH_OPTION_B_AMENDMENT.md):
 *   sub         user_accounts.user_id; auth.uid() in Postgres
 *   role        'authenticated'; PostgREST switches to this Postgres role
 *   aud         'authenticated'; Supabase convention
 *   iss         JQ_JWT_ISSUER
 *   iat, exp    lifetime of ACCESS_TOKEN_TTL_SECONDS (default 15 min)
 *   jti         random id, for audit
 *   session_id  auth_sessions.id; RLS rejects revoked sessions through app.session_is_active()
 * Deliberately absent: username, email, workspace ids, workspace roles. Authorization
 * always comes from workspace_members at query time.
 */
export const ACCESS_ALG = 'ES256';
export const ACCESS_ROLE = 'authenticated';
export const ACCESS_AUD = 'authenticated';

interface SigningMaterial {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

let material: Promise<SigningMaterial> | undefined;

/** Parse and validate the server-only private JWK exactly once. */
export function signingMaterial(): Promise<SigningMaterial> {
  material ??= (async () => {
    let jwk: JWK;
    try {
      const parsed = JSON.parse(env().JQ_JWT_PRIVATE_JWK) as JWK | JWK[];
      jwk = Array.isArray(parsed) ? parsed[0]! : parsed;
    } catch {
      throw new Error('JQ_JWT_PRIVATE_JWK is not valid JSON'); // never echo the value
    }
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) {
      throw new Error('JQ_JWT_PRIVATE_JWK must be an EC P-256 private JWK with a kid');
    }
    // Import only key material: generated JWKs may carry key_ops ['sign','verify'],
    // which WebCrypto rejects for an ECDSA private key.
    const publicJwk: JWK = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    return {
      kid: jwk.kid,
      privateKey: (await importJWK({ ...publicJwk, d: jwk.d, alg: ACCESS_ALG }, ACCESS_ALG)) as CryptoKey,
      publicKey: (await importJWK({ ...publicJwk, alg: ACCESS_ALG }, ACCESS_ALG)) as CryptoKey,
    };
  })();
  return material;
}

/** Test hook. */
export function resetSigningMaterial(): void {
  material = undefined;
}

export interface MintedAccess {
  access_token: string;
  expires_at: number;
  token_type: 'bearer';
}

export async function mintAccessToken(userId: string, sessionId: string, ttlSeconds = env().ACCESS_TOKEN_TTL_SECONDS): Promise<MintedAccess> {
  const { kid, privateKey } = await signingMaterial();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const access_token = await new SignJWT({ role: ACCESS_ROLE, session_id: sessionId })
    .setProtectedHeader({ alg: ACCESS_ALG, kid, typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(env().JQ_JWT_ISSUER)
    .setAudience(ACCESS_AUD)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(randomUUID())
    .sign(privateKey);
  return { access_token, expires_at: exp, token_type: 'bearer' };
}

export interface AccessClaims extends JWTPayload {
  sub: string;
  session_id: string;
  role: string;
}

/** Verify a JobQuest access token (signature, alg, iss, aud, exp). Returns null if invalid. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { publicKey } = await signingMaterial();
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [ACCESS_ALG],
      issuer: env().JQ_JWT_ISSUER,
      audience: ACCESS_AUD,
    });
    if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string' || payload.role !== ACCESS_ROLE) return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}

/** Opaque refresh token: 256 bits from the CSPRNG. Only its SHA-256 is stored server-side. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = `jqr_${randomBytes(32).toString('base64url')}`;
  return { token, hash: sha256Hex(token) };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
