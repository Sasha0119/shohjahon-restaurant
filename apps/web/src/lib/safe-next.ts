/**
 * Only allow same-site, relative redirects after login (prevents open redirects
 * like ?next=//evil.example or ?next=https://evil.example).
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
