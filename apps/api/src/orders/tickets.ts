import { rooms, type OrderTicketDTO } from "@app/shared/api";
import type { Prisma } from "../generated/prisma/client.ts";
import { enums } from "../lib/enums.ts";
import type { Realtime } from "../realtime/types.ts";

/** What to load for an order so it can be shown as a ticket. */
export const ticketInclude = {
  items: { include: { modifiers: true }, orderBy: { createdAt: "asc" as const } },
  session: { select: { table: { select: { number: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderWithTicket = Prisma.OrderGetPayload<{ include: typeof ticketInclude }>;

export function toTicketDTO(o: OrderWithTicket): OrderTicketDTO {
  return {
    id: o.id,
    round: o.round,
    station: enums.station.fromDb(o.station),
    status: enums.orderStatus.fromDb(o.status),
    createdAt: o.createdAt.toISOString(),
    statusChangedAt: o.statusChangedAt.toISOString(),
    tableNumber: o.session.table.number,
    lines: o.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      modifiers: i.modifiers.map((m) => ({ group: m.groupName, option: m.optionName, priceDeltaCents: m.priceDeltaCents })),
      note: i.note,
      addedBy: i.addedByName,
    })),
  };
}

/** Push a ticket to its kitchen/bar screen and to managers. */
export function emitTicket(realtime: Realtime, ticket: OrderTicketDTO): void {
  realtime.emit([rooms.kds(ticket.station), rooms.managers], "kds:order", { ticket });
}
