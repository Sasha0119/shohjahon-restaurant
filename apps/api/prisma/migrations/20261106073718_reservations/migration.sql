-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "party_size" INTEGER NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_table_id_status_starts_at_idx" ON "reservations"("table_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_status_starts_at_idx" ON "reservations"("status", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_guest_phone_status_idx" ON "reservations"("guest_phone", "status");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
