import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque session tokens: 256 random bits, base64url. The browser holds the
 * raw token in an httpOnly cookie; the database stores only its SHA-256, so a
 * leaked database can't be used to log in.
 */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
