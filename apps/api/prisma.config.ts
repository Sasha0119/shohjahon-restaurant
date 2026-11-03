import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration. DATABASE_URL comes from apps/api/.env
 * (copy .env.example). A placeholder lets `prisma generate`/`validate` run
 * without a database.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
