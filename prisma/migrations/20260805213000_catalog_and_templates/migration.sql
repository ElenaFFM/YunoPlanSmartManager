-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IinStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TemplateScope" AS ENUM ('GENERAL', 'BANK');

-- AlterTable
ALTER TABLE "CampaignVersion" ADD COLUMN "sourceTemplateVersionId" TEXT;

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankIin" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" "IinStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankIin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "TemplateScope" NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "configurationSnapshot" JSONB NOT NULL,
    "bankId" TEXT,
    "changeReason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_code_key" ON "Bank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE INDEX "Bank_status_name_idx" ON "Bank"("status", "name");

-- CreateIndex
CREATE INDEX "BankIin_bankId_status_idx" ON "BankIin"("bankId", "status");

-- CreateIndex
CREATE INDEX "BankIin_value_status_idx" ON "BankIin"("value", "status");

-- Enforce one active owner for each BIN/IIN while retaining inactive history.
CREATE UNIQUE INDEX "BankIin_active_value_key" ON "BankIin"("value") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "PromotionTemplate_name_key" ON "PromotionTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionTemplate_currentVersionId_key" ON "PromotionTemplate"("currentVersionId");

-- CreateIndex
CREATE INDEX "PromotionTemplate_status_name_idx" ON "PromotionTemplate"("status", "name");

-- CreateIndex
CREATE INDEX "TemplateVersion_bankId_createdAt_idx" ON "TemplateVersion"("bankId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_versionNumber_key" ON "TemplateVersion"("templateId", "versionNumber");

-- AddForeignKey
ALTER TABLE "BankIin" ADD CONSTRAINT "BankIin_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTemplate" ADD CONSTRAINT "PromotionTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PromotionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_sourceTemplateVersionId_fkey" FOREIGN KEY ("sourceTemplateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
