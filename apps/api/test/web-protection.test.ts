import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { kdsSubscribePayload, sessionSyncPayload, zPhoneInput } from "@app/shared/api";
import { pino } from "pino";
import { io as connect } from "socket.io-client";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { CONNECTION_LIMIT, connectionAddress, createConnectionLimiter } from "../src/http/client-ip.ts";
import { createSocketServer, type IoServer } from "../src/realtime/socket.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { csvCell } from "../src/reports/csv.ts";
import { createLocalImageStore } from "../src/uploads/image-store.ts";

const ORIGIN = "http://localhost:3000";
const SECRET = "Zt8Kq2mVx9Lp4Rn7Wc3Hb6Yd1Fg5Js0Aa";
const noDb = new Proxy({}, { get: () => () => Promise.resolve(null) }) as unknown as Db;
const env = parseEnv({
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  CORS_ORIGINS: ORIGIN,
  PUBLIC_WEB_URL: ORIGIN,
  QR_TOKEN_SECRET: "q".repeat(40),
  COOKIE_SECRET: "c".repeat(40),
  INTERNAL_PROXY_SECRET: SECRET,
});

describe("rate limits see the real visitor", () => {
  const app = () =>
    createApp({ db: noDb, env, logger: pino({ level: "silent" }), realtime: createRecordingRealtime() }).app;
  const remaining = (res: request.Response) => Number(/r=(\d+)/.exec(String(res.headers.ratelimit))?.[1]);
  const viaWeb = (a: ReturnType<typeof app>, ip: string, secret = SECRET) =>
    request(a).get("/api/menu/nope").set("x-internal-proxy-secret", secret).set("x-client-ip", ip);

  it("gives each visitor behind the web server their own limit", async () => {
    const a = app();
    expect(remaining(await viaWeb(a, "203.0.113.1"))).toBe(599);
    expect(remaining(await viaWeb(a, "203.0.113.1"))).toBe(598);
    expect(remaining(await viaWeb(a, "203.0.113.2"))).toBe(599);
  });

  it("ignores the header without the right secret, so it can't be used to dodge a limit", async () => {
    const a = app();
    expect(remaining(await viaWeb(a, "203.0.113.1", "wrong-secret-wrong-secret-wrong-1"))).toBe(599);
    expect(remaining(await viaWeb(a, "203.0.113.2", "wrong-secret-wrong-secret-wrong-1"))).toBe(598);
    expect(remaining(await request(a).get("/api/menu/nope").set("x-client-ip", "203.0.113.3"))).toBe(597);
  });

  it("ignores a value that isn't an IP address", async () => {
    const a = app();
    expect(remaining(await viaWeb(a, "not-an-ip"))).toBe(599);
    expect(remaining(await viaWeb(a, "also-not-an-ip"))).toBe(598);
  });
});

describe("socket connections", () => {
  let server: Server;
  let io: IoServer;
  let url: string;

  beforeAll(async () => {
    server = createServer();
    io = createSocketServer(server, { db: noDb, env, logger: pino({ level: "silent" }) }).io;
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await io.close();
  });

  /** What a connection attempt was refused for. Unauthenticated, so an allowed one fails at the login check. */
  const refusal = (origin?: string) =>
    new Promise<string>((done) => {
      const s = connect(url, {
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: origin ? { origin } : {},
      });
      s.once("connect_error", (e) => {
        s.close();
        done(e.message);
      });
    });

  it("refuses other websites before looking at any cookie", async () => {
    expect(await refusal("https://evil.example")).toBe("websocket error");
  });

  it("allows the app's own website and clients that send no origin", async () => {
    expect(await refusal(ORIGIN)).toBe("NO_SESSION");
    expect(await refusal()).toBe("NO_SESSION");
  });

  it("limits new connections per address, and frees them the next minute", () => {
    let time = 0;
    const allow = createConnectionLimiter(() => time);
    for (let i = 0; i < CONNECTION_LIMIT.perMinute; i++) expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
    time = 60_000;
    expect(allow("a")).toBe(true);
  });

  it("reads the address like Express does", () => {
    const req = (forwarded?: string) =>
      ({
        headers: forwarded ? { "x-forwarded-for": forwarded } : {},
        socket: { remoteAddress: "10.0.0.1" },
      }) as unknown as IncomingMessage;
    expect(connectionAddress(req("1.1.1.1, 2.2.2.2"), true)).toBe("2.2.2.2");
    expect(connectionAddress(req("1.1.1.1"), false)).toBe("10.0.0.1");
    expect(connectionAddress(req(), true)).toBe("10.0.0.1");
  });

  it("validates event payloads", () => {
    expect(sessionSyncPayload.safeParse({ version: 3 }).success).toBe(true);
    expect(sessionSyncPayload.safeParse({ version: "3" }).success).toBe(false);
    expect(sessionSyncPayload.safeParse(null).success).toBe(false);
    expect(kdsSubscribePayload.safeParse({ stations: ["kitchen", "bar"] }).success).toBe(true);
    expect(kdsSubscribePayload.safeParse({ stations: ["managers"] }).success).toBe(false);
    expect(kdsSubscribePayload.safeParse({ stations: Array(3).fill("bar") }).success).toBe(false);
  });
});

describe("inputs", () => {
  it("caps the phone number's length", () => {
    expect(zPhoneInput.safeParse("+998 90 123 45 67").success).toBe(true);
    expect(zPhoneInput.safeParse(`+998${"0".repeat(100_000)}`).success).toBe(false);
  });

  it("neutralises spreadsheet formulas, including behind whitespace", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", " =1+1", "\n=1+1", "\t=1+1"]) {
      expect(csvCell(bad).replace(/^"/, "").startsWith("'"), JSON.stringify(bad)).toBe(true);
    }
    expect(csvCell("Plov")).toBe("Plov");
    expect(csvCell(-5)).toBe("-5");
  });

  it("never builds raw SQL from strings", async () => {
    const root = path.join(import.meta.dirname, "../src");
    const files = (await readdir(root, { recursive: true })).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("generated"),
    );
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) {
      expect(await readFile(path.join(root, f), "utf8"), f).not.toMatch(/\$(query|execute)RawUnsafe/);
    }
  });
});

describe("photo uploads", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "uploads-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const save = (file: Buffer) => createLocalImageStore(dir).save(file);
  const photo = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#884400" } });

  it("accepts real photos and stores them under a random name, as WebP", async () => {
    const saved = await save(await photo().png().toBuffer());
    expect(saved.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);
    expect((await sharp(await readFile(path.join(dir, path.basename(saved.url)))).metadata()).format).toBe("webp");
  });

  it("refuses SVG and other formats the app doesn't accept, whatever the file is called", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><script>alert(1)</script></svg>`;
    await expect(save(Buffer.from(svg))).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
    await expect(save(await photo().gif().toBuffer())).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
    await expect(save(Buffer.from("not an image at all"))).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
  });
});
