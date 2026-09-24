import { hash, verify } from '@node-rs/argon2';
import { env } from '../env';

/**
 * Option B password verifiers: Argon2id, parameters configured centrally in env.ts.
 * Stored as a PHC string (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`), so the parameters
 * travel with each hash and can be raised later without breaking old verifiers.
 */
function params() {
  const e = env();
  return {
    algorithm: 2 as const, // Algorithm.Argon2id
    memoryCost: e.PASSWORD_ARGON2_MEMORY_KIB,
    timeCost: e.PASSWORD_ARGON2_TIME_COST,
    parallelism: e.PASSWORD_ARGON2_PARALLELISM,
  };
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, params());
}

export async function verifyPassword(phc: string, password: string): Promise<boolean> {
  try {
    return await verify(phc, password);
  } catch {
    return false;
  }
}

/** True when a stored verifier used weaker parameters than the current policy. */
export function needsRehash(phc: string): boolean {
  const m = phc.match(/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!m) return true;
  const p = params();
  return Number(m[1]) < p.memoryCost || Number(m[2]) < p.timeCost || Number(m[3]) < p.parallelism;
}

let dummy: Promise<string> | undefined;
/**
 * Verify against a fixed dummy hash when the username does not exist, so unknown and
 * known usernames cost the same Argon2 work (username-enumeration timing).
 */
export async function burnVerify(password: string): Promise<void> {
  dummy ??= hashPassword('jobquest-timing-equalizer-not-a-password');
  await verifyPassword(await dummy, password);
}
