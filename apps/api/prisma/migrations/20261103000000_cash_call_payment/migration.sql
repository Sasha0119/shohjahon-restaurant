-- AlterTable
ALTER TABLE "waiter_calls" ADD COLUMN     "payment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "waiter_calls_payment_id_key" ON "waiter_calls"("payment_id");

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

