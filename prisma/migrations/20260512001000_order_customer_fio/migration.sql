-- AlterTable
ALTER TABLE "Order"
ADD COLUMN     "customerLastName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customerFirstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customerMiddleName" TEXT NOT NULL DEFAULT '';
