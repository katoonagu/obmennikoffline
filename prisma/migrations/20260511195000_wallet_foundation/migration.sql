-- CreateEnum
CREATE TYPE "Network" AS ENUM ('TRON');

-- CreateEnum
CREATE TYPE "Asset" AS ENUM ('USDT');

-- CreateEnum
CREATE TYPE "OrderDirection" AS ENUM ('BUY_USDT', 'SELL_USDT');

-- CreateEnum
CREATE TYPE "DepositAddressStatus" AS ENUM ('available', 'reserved', 'funded', 'expired', 'late_funded', 'disabled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'awaiting_deposit', 'awaiting_office_visit', 'funds_detected', 'pending_aml', 'manager_review', 'ready_for_cash_payout', 'ready_for_crypto_payout', 'completed', 'cancelled', 'expired', 'late_payment', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "OrderDirection" NOT NULL,
    "asset" "Asset" NOT NULL DEFAULT 'USDT',
    "network" "Network" NOT NULL DEFAULT 'TRON',
    "amountUsdt" DECIMAL(36,6),
    "amountRub" DECIMAL(36,2),
    "rateSnapshot" DECIMAL(36,6) NOT NULL,
    "rateExpiresAt" TIMESTAMP(3) NOT NULL,
    "orderExpiresAt" TIMESTAMP(3) NOT NULL,
    "depositAddressId" TEXT,
    "clientPayoutAddress" TEXT,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL DEFAULT 'TRON',
    "asset" "Asset" NOT NULL DEFAULT 'USDT',
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "status" "DepositAddressStatus" NOT NULL DEFAULT 'available',
    "reservedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockchainTransaction" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL DEFAULT 'TRON',
    "asset" "Asset" NOT NULL DEFAULT 'USDT',
    "txId" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL DEFAULT 0,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(36,6) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockchainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramProfile_userId_key" ON "TelegramProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramProfile_telegramUserId_key" ON "TelegramProfile"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicId_key" ON "Order"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_depositAddressId_key" ON "Order"("depositAddressId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_orderExpiresAt_idx" ON "Order"("status", "orderExpiresAt");

-- CreateIndex
CREATE INDEX "Order_status_rateExpiresAt_idx" ON "Order"("status", "rateExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_address_key" ON "DepositAddress"("address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_derivationIndex_key" ON "DepositAddress"("derivationIndex");

-- CreateIndex
CREATE INDEX "DepositAddress_network_asset_status_derivationIndex_idx" ON "DepositAddress"("network", "asset", "status", "derivationIndex");

-- CreateIndex
CREATE INDEX "DepositAddress_status_expiresAt_idx" ON "DepositAddress"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BlockchainTransaction_toAddress_idx" ON "BlockchainTransaction"("toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainTransaction_network_txId_logIndex_key" ON "BlockchainTransaction"("network", "txId", "logIndex");

-- CreateIndex
CREATE INDEX "AuditLog_orderId_createdAt_idx" ON "AuditLog"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramProfile" ADD CONSTRAINT "TelegramProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_depositAddressId_fkey" FOREIGN KEY ("depositAddressId") REFERENCES "DepositAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockchainTransaction" ADD CONSTRAINT "BlockchainTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
