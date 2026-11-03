import { brand } from "@app/config";
import { createReviewBody, feedbackQuery, updateFeedbackBody, zId } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { PUBLIC_RATING_MIN, createReview, feedbackInclude, toFeedbackDTO } from "./service.ts";

type On = ReturnType<typeof createRegistrar>["on"];
const PAGE_SIZE = 30;

export function registerReviewRoutes(on: On, db: Db, realtime: Realtime) {
  on("POST", "/api/session/review", async (req, res) => {
    const input = parse(createReviewBody, req.body);
    const { kind } = await createReview(db, realtime, req.guest!, input);
    // Public review links live in brand.ts; the server decides when to show them.
    res.status(201).json({ kind, reviewLinks: kind === "public" ? brand.reviewLinks : [] });
  });

  /** Private feedback only (1–3 stars), newest first. */
  on("GET", "/api/admin/feedback", async (req, res) => {
    const q = parse(feedbackQuery, req.query);
    const where: Prisma.ReviewWhereInput = {
      rating: { lt: PUBLIC_RATING_MIN },
      ...(q.status ? { status: q.status === "new" ? "NEW" : "HANDLED" } : {}),
    };
    const [items, total, counts] = await Promise.all([
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: feedbackInclude,
      }),
      db.review.count({ where }),
      db.review.groupBy({ by: ["status"], where: { rating: { lt: PUBLIC_RATING_MIN } }, _count: true }),
    ]);
    const count = (s: "NEW" | "HANDLED") => counts.find((c) => c.status === s)?._count ?? 0;
    res.json({
      feedback: items.map(toFeedbackDTO),
      page: q.page,
      pageSize: PAGE_SIZE,
      total,
      counts: { new: count("NEW"), handled: count("HANDLED") },
    });
  });

  on("PATCH", "/api/admin/feedback/:reviewId", async (req, res) => {
    const id = parse(zId, req.params.reviewId);
    const { status } = parse(updateFeedbackBody, req.body);
    const found = await db.review.findUnique({ where: { id }, select: { rating: true } });
    if (!found || found.rating >= PUBLIC_RATING_MIN) throw errors.notFound("Feedback");
    const handled = status === "handled";
    const review = await db.review.update({
      where: { id },
      data: { status: handled ? "HANDLED" : "NEW", handledAt: handled ? new Date() : null, handledById: handled ? req.staff!.id : null },
      include: feedbackInclude,
    });
    await audit(db, { actor: { type: "staff", staffId: req.staff!.id }, action: "feedback.updated", entityType: "review", entityId: id, data: { status }, ip: req.ip });
    res.json({ feedback: toFeedbackDTO(review) });
  });
}
