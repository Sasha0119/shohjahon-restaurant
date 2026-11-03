import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Table QR tokens:  <tableId>.<qrVersion>.<signature>
 *
 *  • signature = HMAC-SHA256(QR_TOKEN_SECRET, "table-qr:v1:<tableId>.<qrVersion>"),
 *    truncated to 128 bits, base64url (22 chars).
 *  • Unguessable and unforgeable without the secret; changing any character
 *    (e.g. another table id) invalidates it.
 *  • Bumping a table's qrVersion ("rotate QR") invalidates its printed codes.
 *  • Using the table's id (not its number) means renumbering never breaks a QR.
 */

const SIG_BYTES = 16;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function sign(secret: string, tableId: string, version: number): string {
  return createHmac("sha256", secret)
    .update(`table-qr:v1:${tableId}.${version}`)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString("base64url");
}

export function createQrToken(secret: string, tableId: string, qrVersion: number): string {
  if (!ID_RE.test(tableId)) throw new Error("Invalid table id");
  if (!Number.isInteger(qrVersion) || qrVersion < 1) throw new Error("Invalid QR version");
  return `${tableId}.${qrVersion}.${sign(secret, tableId, qrVersion)}`;
}

export type QrVerdict = { ok: true; tableId: string; qrVersion: number } | { ok: false };

/** Check the signature only. The caller then compares qrVersion with the table's current one. */
export function verifyQrToken(secret: string, token: string): QrVerdict {
  if (typeof token !== "string" || token.length > 120) return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [tableId, versionText, sig] = parts as [string, string, string];
  if (!ID_RE.test(tableId) || !/^[1-9]\d{0,8}$/.test(versionText)) return { ok: false };
  const qrVersion = Number(versionText);
  const expected = Buffer.from(sign(secret, tableId, qrVersion));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false };
  return { ok: true, tableId, qrVersion };
}

export function guestTableUrl(publicWebUrl: string, token: string): string {
  return `${publicWebUrl.replace(/\/+$/, "")}/table/${token}`;
}
