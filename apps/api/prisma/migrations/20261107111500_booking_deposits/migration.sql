-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'DONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationStatus" ADD VALUE 'PENDING';
ALTER TYPE "ReservationStatus" ADD VALUE 'SEATED';

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "cook_alerted_at" TIMESTAMP(3),
ADD COLUMN     "seated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reservation_items" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "station" "Station" NOT NULL,
    "modifiers" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_deposits" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "failure_reason" TEXT,
    "refund_cents" INTEGER NOT NULL DEFAULT 0,
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "reservation_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_items_reservation_id_idx" ON "reservation_items"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_items_item_id_idx" ON "reservation_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_deposits_reservation_id_key" ON "reservation_deposits"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_deposits_refund_status_idx" ON "reservation_deposits"("refund_status");

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_deposits" ADD CONSTRAINT "reservation_deposits_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

