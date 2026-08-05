-- AlterEnum
ALTER TYPE "TemplateScope" ADD VALUE 'AMEX';

-- CreateTable
CREATE TABLE "TestCard" (
    "id" TEXT NOT NULL,
    "bankId" TEXT,
    "label" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "iin" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestCard_bankId_active_idx" ON "TestCard"("bankId", "active");

-- AddForeignKey
ALTER TABLE "TestCard" ADD CONSTRAINT "TestCard_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
