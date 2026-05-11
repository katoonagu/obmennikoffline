-- CreateTable
CREATE TABLE "WatcherCursor" (
    "id" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "asset" "Asset" NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL,
    "confirmationDepth" INTEGER NOT NULL,
    "maxBlockRange" INTEGER NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatcherCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatcherCursor_network_asset_key" ON "WatcherCursor"("network", "asset");
