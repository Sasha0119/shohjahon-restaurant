import argon2 from "argon2";

/**
 * Password and PIN hashing (Argon2id, OWASP-recommended parameters).
 * PINs are short, so login attempts are also rate-limited and accounts lock
 * after repeated failures (Phase 3) — hashing alone isn't enough for PINs.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashSecret(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifySecret(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
