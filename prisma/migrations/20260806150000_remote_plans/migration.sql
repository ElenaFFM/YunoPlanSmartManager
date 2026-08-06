-- CreateEnum
CREATE TYPE "RemotePlanStatus" AS ENUM ('ACTIVE', 'FUTURE', 'EXPIRED', 'DELETED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemotePlanOrigin" AS ENUM ('TOOL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "RemotePlanImportStatus" AS ENUM ('PENDING', 'CLASSIFIED', 'ANOMALY');

-- CreateTable
CREATE TABLE "RemotePlan" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT,
    "environment" "Environment" NOT NULL,
    "accountId" TEXT NOT NULL,
    "yunoPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rangeIndex" INTEGER,
    "segmentKey" TEXT,
    "requestSnapshot" JSONB,
    "responseSnapshot" JSONB NOT NULL,
    "remoteCreatedAt" TIMESTAMP(3) NOT NULL,
    "remoteUpdatedAt" TIMESTAMP(3) NOT NULL,
    "startAt" TIMESTAMP(3),
    "finishAt" TIMESTAMP(3),
    "status" "RemotePlanStatus" NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deleteReason" TEXT,
    "replacesRemotePlanId" TEXT,
    "equivalentLogicalKey" TEXT,
    "origin" "RemotePlanOrigin" NOT NULL DEFAULT 'IMPORTED',
    "importStatus" "RemotePlanImportStatus" NOT NULL DEFAULT 'PENDING',
    "importNotes" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemotePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemotePlan_environment_yunoPlanId_key" ON "RemotePlan"("environment", "yunoPlanId");

-- CreateIndex
CREATE INDEX "RemotePlan_environment_status_startAt_finishAt_idx" ON "RemotePlan"("environment", "status", "startAt", "finishAt");

-- CreateIndex
CREATE INDEX "RemotePlan_deploymentId_idx" ON "RemotePlan"("deploymentId");

-- CreateIndex
CREATE INDEX "RemotePlan_importStatus_lastSeenAt_idx" ON "RemotePlan"("importStatus", "lastSeenAt");

-- CreateIndex
CREATE INDEX "RemotePlan_replacesRemotePlanId_idx" ON "RemotePlan"("replacesRemotePlanId");

-- AddForeignKey
ALTER TABLE "RemotePlan" ADD CONSTRAINT "RemotePlan_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemotePlan" ADD CONSTRAINT "RemotePlan_replacesRemotePlanId_fkey" FOREIGN KEY ("replacesRemotePlanId") REFERENCES "RemotePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
