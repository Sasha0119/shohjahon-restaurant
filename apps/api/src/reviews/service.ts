import { rooms, type FeedbackDTO } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { ApiError } from "../http/errors.ts";
import type { Realtime } from "../realtime/types.ts";
import type { AuthedGuest } from "../sessions/service.ts";

/** 4–5 stars are happy guests (shown public review links); 1–3 is private feedback for the manager. */
export const PUBLIC_RATING_MIN = 4;
const isPublicRating = (rating: number) => rating >= PUBLIC_RATING_MIN;

export const feedbackInclude = {
  session: { select: { table: { select: { number: true } } } },
  guest: { select: { nickname: true } },
  handledBy: { select: { name: true } },
} satisfies Prisma.ReviewInclude;

export function toFeedbackDTO(r: Prisma.ReviewGetPayload<{ include: typeof feedbackInclude }>): FeedbackDTO {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    status: r.status === "NEW" ? "new" : "handled",
    tableNumber: r.session.table.number,
    guestName: r.guest?.nickname ?? "",
    createdAt: r.createdAt.toISOString(),
    handledAt: r.handledAt?.toISOString() ?? null,
    handledBy: r.handledBy?.name ?? null,
  };
}

/**
 * A guest rates their visit. Allowed only once per guest per visit, and only
 * after money has changed hands: this guest paid, or the table's bill is
 * fully paid.
 */
export async function createReview(
  db: Db,
  realtime: Realtime,
  guest: AuthedGuest,
  input: { rating: number; comment: string },
): Promise<{ kind: "public" | "private" }> {
  const [paidByMe, session] = await Promise.all([
    db.payment.count({ where: { sessionId: guest.sessionId, guestId: guest.id, status: "SUCCEEDED" } }),
    db.tableSession.findUniqueOrThrow({ where: { id: guest.sessionId }, select: { closeReason: true } }),
  ]);
  if (paidByMe === 0 && session.closeReason !== "PAID") {
    throw new ApiError(403, "PAYMENT_REQUIRED", "You can rate your visit after paying.");
  }

  const publicRating = isPublicRating(input.rating);
  let review;
  try {
    review = await db.review.create({
      data: {
        sessionId: guest.sessionId,
        guestId: guest.id,
        rating: input.rating,
        comment: input.comment,
        // Happy reviews don't need follow-up, so they never sit in the "new" queue.
        status: publicRating ? "HANDLED" : "NEW",
      },
      include: feedbackInclude,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "ALREADY_REVIEWED", "Thanks — you've already rated this visit.");
    }
    throw e;
  }
  await audit(db, {
    actor: { type: "guest", guestId: guest.id },
    action: "review.created",
    entityType: "review",
    entityId: review.id,
    data: { rating: input.rating },
  });
  if (!publicRating) realtime.emit(rooms.managers, "feedback:created", { feedback: toFeedbackDTO(review) });
  return { kind: publicRating ? "public" : "private" };
}
