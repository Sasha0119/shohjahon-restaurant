import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

/**
 * Prisma client using the node-postgres driver adapter (Prisma 7).
 * One client per process; it manages its own connection pool.
 */
export function createPrisma(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type Db = ReturnType<typeof createPrisma>;
