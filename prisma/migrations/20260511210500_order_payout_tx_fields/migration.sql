ALTER TABLE "Order"
ADD COLUMN "payoutTxId" TEXT,
ADD COLUMN "payoutTxRecordedAt" TIMESTAMP(3),
ADD COLUMN "payoutTxRecordedBy" TEXT;

CREATE UNIQUE INDEX "Order_payoutTxId_key" ON "Order"("payoutTxId");
