-- CreateEnum
CREATE TYPE "TestRunLogicalCheckpoint" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('PENDING', 'RESETTING', 'BUILDING', 'READY', 'RECORDING', 'COMPLETED', 'FAILED', 'ABORTED');

-- CreateEnum
CREATE TYPE "TestRunCleanupStatus" AS ENUM ('NOT_STARTED', 'CLEANED', 'RESIDUAL');

-- CreateEnum
CREATE TYPE "TestCaseScope" AS ENUM ('AMEX', 'BANK', 'GENERAL');

-- CreateEnum
CREATE TYPE "TestCaseAmountLabel" AS ENUM ('MIN', 'MAX', 'INTERIOR', 'ADJACENT_BELOW_MIN', 'ADJACENT_ABOVE_MAX');

-- CreateEnum
CREATE TYPE "TestCaseResultStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "campaignVersionId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "logicalCheckpoint" "TestRunLogicalCheckpoint" NOT NULL,
    "segmentIndex" INTEGER,
    "dateShiftSeconds" INTEGER NOT NULL,
    "status" "TestRunStatus" NOT NULL DEFAULT 'PENDING',
    "lockKey" TEXT NOT NULL,
    "resetRunId" TEXT,
    "buildRunId" TEXT,
    "cleanupRunId" TEXT,
    "cleanupStatus" "TestRunCleanupStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "testedHash" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseResult" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "scope" "TestCaseScope" NOT NULL,
    "bankId" TEXT,
    "rangeIndex" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "amountLabel" "TestCaseAmountLabel" NOT NULL,
    "testCardId" TEXT,
    "expectedInstallments" JSONB NOT NULL,
    "observedInstallments" JSONB,
    "result" "TestCaseResultStatus" NOT NULL DEFAULT 'PENDING',
    "justification" TEXT,
    "testedById" TEXT,
    "testedAt" TIMESTAMP(3),

    CONSTRAINT "TestCaseResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestRun_lockKey_status_idx" ON "TestRun"("lockKey", "status");

-- CreateIndex
CREATE INDEX "TestRun_campaignVersionId_idx" ON "TestRun"("campaignVersionId");

-- CreateIndex
CREATE INDEX "TestCaseResult_testRunId_result_idx" ON "TestCaseResult"("testRunId", "result");

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_campaignVersionId_fkey" FOREIGN KEY ("campaignVersionId") REFERENCES "CampaignVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_resetRunId_fkey" FOREIGN KEY ("resetRunId") REFERENCES "ExecutionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_buildRunId_fkey" FOREIGN KEY ("buildRunId") REFERENCES "ExecutionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_cleanupRunId_fkey" FOREIGN KEY ("cleanupRunId") REFERENCES "ExecutionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseResult" ADD CONSTRAINT "TestCaseResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseResult" ADD CONSTRAINT "TestCaseResult_testCardId_fkey" FOREIGN KEY ("testCardId") REFERENCES "TestCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseResult" ADD CONSTRAINT "TestCaseResult_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
