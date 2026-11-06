import { createHash } from "node:crypto";
import { zIdempotencyKey } from "@app/shared/api";
import type { Request } from "express";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { ApiError } from "./errors.ts";

type Tx = Prisma.TransactionClient;

export interface IdemResult {
  status: number;
  body: Prisma.InputJsonValue;
}

/**
 * Exactly-once handling for unsafe guest actions (send order, pay):
 *
 *  • The client sends an `Idempotency-Key` header and reuses it on retries.
 *  • The work and the stored response commit in ONE transaction, so either
 *    both happen or neither does.
 *  • A retry with the same key and body gets the stored response back; the
 *    same key with a different body is rejected (422).
 *  • `onConflict` errors (e.g. "cart changed" because the first attempt
 *    already emptied it) are replaced by the stored response if one exists.
 */
export async function idempotent(
  db: Db,
  req: Request,
  scope: string,
  /** Identifies who is calling (e.g. the guest id) so keys can't collide across users. */
  owner: string,
  work: (tx: Tx) => Promise<IdemResult>,
  opts: { conflictCodes?: string[] } = {},
): Promise<IdemResult> {
  const parsed = zIdempotencyKey.safeParse(req.get("Idempotency-Key"));
  if (!parsed.success) {
    throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header (16–128 characters).");
  }
  const key = `${scope}:${owner}:${parsed.data}`;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(req.body ?? null))
    .digest("hex");

  const replay = async (): Promise<IdemResult | null> => {
    const rec = await db.idempotencyRecord.findUnique({ where: { key } });
    if (!rec) return null;
    if (rec.requestHash !== requestHash) {
      throw new ApiError(422, "IDEMPOTENCY_MISMATCH", "This Idempotency-Key was already used for a different request.");
    }
    return { status: rec.statusCode, body: rec.response as Prisma.InputJsonValue };
  };

  const earlier = await replay();
  if (earlier) return earlier;

  try {
    return await db.$transaction(async (tx) => {
      const result = await work(tx);
      await tx.idempotencyRecord.create({
        data: { key, scope, requestHash, statusCode: result.status, response: result.body },
      });
      return result;
    });
  } catch (e) {
    const racedOnKey = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
    const conflict = e instanceof ApiError && (opts.conflictCodes ?? []).includes(e.code);
    if (racedOnKey || conflict) {
      const stored = await replay();
      if (stored) return stored;
    }
    throw e;
  }
}
