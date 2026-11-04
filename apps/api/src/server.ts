import "dotenv/config";
import { createServer } from "node:http";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { createPrisma } from "./db.ts";
import { EnvError, env as loadEnv } from "./env.ts";
import { createSocketServer } from "./realtime/socket.ts";
import { startSessionSweeper } from "./sessions/sweeper.ts";

/** API entry point:  npm run dev -w @app/api */
async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(`\n${e.message}\n\nSee apps/api/.env.example\n`);
      process.exit(1);
    }
    throw e;
  }

  const logger = pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
  const db = createPrisma(env.DATABASE_URL);
  // The Express app needs the realtime emitter, and Socket.io needs the HTTP server.
  // Express must be the request listener BEFORE Socket.io attaches: Socket.io then
  // intercepts /socket.io/ and forwards everything else to Express (never both).
  let app: ReturnType<typeof createApp>["app"] | undefined;
  const server = createServer((req, res) => app!(req, res));
  const { io, realtime } = createSocketServer(server, { db, env, logger });
  app = createApp({ db, env, logger, realtime }).app;
  const stopSweeper = startSessionSweeper({ db, realtime, logger, idleMinutes: env.SESSION_IDLE_MINUTES });

  // The web server (and any reverse proxy) reuses idle connections to the API.
  // Node closes idle ones after 5 s by default; a request that lands on a
  // connection just as it closes fails with ECONNRESET ("Can't reach the
  // restaurant"). Keep idle connections open longer than the proxies do.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(env.API_PORT, () => logger.info(`API listening on http://localhost:${env.API_PORT}`));

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopSweeper();
    void io.close();
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Log and exit on programming errors; the container/process manager restarts the API.
  // Data stays safe: every money/order change runs in a database transaction.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    shutdown("uncaughtException");
  });
}

void main();
