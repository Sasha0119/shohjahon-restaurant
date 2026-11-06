/**
 * Generates docs/api.md from packages/shared/src/api/routes.ts.
 *   npm run docs:api
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routes, type RouteDef } from "../packages/shared/src/api/routes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function access(r: RouteDef): string {
  if (r.access.kind === "public") return "public";
  if (r.access.kind === "guest") return "guest";
  return r.access.roles.join(", ");
}

const groups = new Map<string, RouteDef[]>();
for (const r of routes) {
  const seg = r.path.split("/")[2] ?? "";
  const key =
    seg === "admin" ? `admin/${r.path.split("/")[3]}` : seg === "session" || seg === "tables" ? "guest session" : seg;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}

const lines: string[] = [
  "# API reference",
  "",
  "> Generated from `packages/shared/src/api/routes.ts` by `npm run docs:api`. Do not edit by hand.",
  "",
  "- Base path `/api`, JSON bodies, money in integer **cents**.",
  '- Errors: `{ "error": { "code": "CART_CHANGED", "message": "…", "details"?: … } }`.',
  "- **guest** = has a guest cookie from scanning the table QR. Roles = staff cookie with that role.",
  "- **Idem.** = requires an `Idempotency-Key` header (16–128 chars). Retrying returns the first response.",
  "- Inputs are validated with the named Zod schema from `packages/shared/src/api/schemas.ts`.",
  "",
  `**${routes.length} routes.**`,
  "",
];

for (const [group, rs] of groups) {
  lines.push(
    `## ${group}`,
    "",
    "| Method | Path | Access | Input | Idem. | Emits | Phase | Description |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const r of rs) {
    lines.push(
      `| ${r.method} | \`${r.path}\` | ${access(r)} | ${r.input ? `\`${r.input}\`` : ""} | ${r.idempotent ? "✓" : ""} | ${(r.emits ?? []).map((e) => `\`${e}\``).join(" ")} | ${r.phase} | ${r.summary}${r.rateLimit && r.rateLimit !== "default" ? ` _(rate limit: ${r.rateLimit})_` : ""} |`,
    );
  }
  lines.push("");
}

lines.push(
  "## Realtime (Socket.io)",
  "",
  "Typed contract: `packages/shared/src/api/realtime.ts`.",
  "",
  "**Rules**",
  "",
  "1. Changes happen over REST only; sockets push what changed. The DB is the source of truth.",
  "2. The server assigns rooms from the cookie: `session:<id>`, `kds:kitchen` / `kds:bar`, `waiters`, `managers`.",
  "3. Every session event carries `version`. Next version → apply; older → ignore; gap → `session:sync`.",
  "4. On every (re)connect the client emits `session:sync { version }` and gets `upToDate` or a full snapshot.",
  "",
  "| Event | Direction | Room | Payload |",
  "|---|---|---|---|",
  "| `session:sync` | client → server (ack) | — | `{ version }` → `{ upToDate }` or `{ snapshot }` |",
  '| `kds:subscribe` | client → server (ack) | — | `{ stations: ("kitchen"\\|"bar")[] }` |',
  "| `session:guests` | server → client | session | `{ version, guests }` |",
  "| `cart:updated` | server → client | session | `{ version, cart }` |",
  "| `order:created` | server → client | session | `{ version, tickets }` |",
  "| `order:updated` | server → client | session | `{ version, orderId, round, station, status, at }` |",
  "| `bill:updated` | server → client | session | `{ version, bill }` |",
  "| `payment:updated` | server → client | session | `{ version, payment }` |",
  "| `session:closed` | server → client | session | `{ version, reason: paid\\|staff\\|expired }` |",
  "| `call:created` / `call:updated` | server → client | session + waiters | `{ call }` |",
  "| `menu:stock` | server → client | everyone | `{ itemId, inStock, stockVersion }` (keep the highest stockVersion) |",
  "| `menu:updated` | server → client | everyone | `{ menuVersion }` → refetch `GET /api/menu` |",
  "| `kds:order` | server → client | kds:&lt;station&gt; + managers | `{ ticket }` |",
  "| `table:status` | server → client | waiters + managers | `{ tableId, number, status }` |",
  "",
);

const out = join(root, "docs", "api.md");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(`Wrote ${out} (${routes.length} routes)`);
