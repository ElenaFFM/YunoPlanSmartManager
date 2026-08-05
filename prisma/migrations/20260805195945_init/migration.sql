-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'OPERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignVersionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "DeploymentKind" AS ENUM ('CANONICAL', 'TEST');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PLANNED', 'READY', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'COMPENSATE_CREATE', 'COMPENSATE_UPDATE', 'COMPENSATE_DELETE');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('PENDING', 'SENT', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ResultCertainty" AS ENUM ('CONFIRMED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignVersion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CampaignVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "canonicalHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "configurationSnapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CampaignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "campaignVersionId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "kind" "DeploymentKind" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PLANNED',
    "configurationHash" TEXT NOT NULL,
    "baseSnapshotHash" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRun" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "status" "ExecutionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "baseSnapshotHash" TEXT NOT NULL,
    "approvedPlanHash" TEXT,
    "lockKey" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "failureClassification" TEXT,
    "lastConfirmedOperation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExecutionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionOperation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "OperationType" NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'PENDING',
    "targetRemotePlanId" TEXT,
    "requestSnapshot" JSONB,
    "responseSnapshot" JSONB,
    "expectedResultSnapshot" JSONB,
    "compensationSnapshot" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "resultCertainty" "ResultCertainty",
    "compensationOperationId" TEXT,

    CONSTRAINT "ExecutionOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "campaignVersionId" TEXT NOT NULL,
    "executionRunId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "checklistSnapshot" JSONB NOT NULL,
    "warningsAccepted" JSONB,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_currentVersionId_key" ON "Campaign"("currentVersionId");

-- CreateIndex
CREATE INDEX "CampaignVersion_status_createdAt_idx" ON "CampaignVersion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVersion_campaignId_versionNumber_key" ON "CampaignVersion"("campaignId", "versionNumber");

-- CreateIndex
CREATE INDEX "Deployment_environment_status_scheduledAt_idx" ON "Deployment"("environment", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionRun_idempotencyKey_key" ON "ExecutionRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExecutionRun_status_nextAttemptAt_queuedAt_idx" ON "ExecutionRun"("status", "nextAttemptAt", "queuedAt");

-- CreateIndex
CREATE INDEX "ExecutionRun_lockKey_status_idx" ON "ExecutionRun"("lockKey", "status");

-- CreateIndex
CREATE INDEX "ExecutionOperation_runId_status_idx" ON "ExecutionOperation"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionOperation_runId_sequence_key" ON "ExecutionOperation"("runId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_executionRunId_planHash_revokedAt_idx" ON "Approval"("executionRunId", "planHash", "revokedAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "CampaignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_campaignVersionId_fkey" FOREIGN KEY ("campaignVersionId") REFERENCES "CampaignVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionOperation" ADD CONSTRAINT "ExecutionOperation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ExecutionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionOperation" ADD CONSTRAINT "ExecutionOperation_compensationOperationId_fkey" FOREIGN KEY ("compensationOperationId") REFERENCES "ExecutionOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_campaignVersionId_fkey" FOREIGN KEY ("campaignVersionId") REFERENCES "CampaignVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_executionRunId_fkey" FOREIGN KEY ("executionRunId") REFERENCES "ExecutionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
