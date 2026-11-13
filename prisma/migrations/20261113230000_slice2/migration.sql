-- CreateEnum
CREATE TYPE "RejectReason" AS ENUM ('misleading_terms', 'not_available', 'broken_link', 'prohibited_category', 'missing_licence', 'creative_standards');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('open', 'due', 'paid');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('delivery', 'reward', 'payment', 'credit', 'refund');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('queued', 'sent', 'held', 'blocked', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('approved', 'credit', 'pace', 'ended', 'weekly', 'review', 'system');

-- CreateEnum
CREATE TYPE "CreditRequestStatus" AS ENUM ('open', 'approved', 'dismissed');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('review', 'rejected', 'applied');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('open', 'paid');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'scheduled';
ALTER TYPE "CampaignStatus" ADD VALUE 'ended';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelEventType" ADD VALUE 'ShareOpen';
ALTER TYPE "ChannelEventType" ADD VALUE 'ShareClaim';

-- AlterEnum
ALTER TYPE "ShareVia" ADD VALUE 'facebook';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "ageGated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpmCents" INTEGER,
ADD COLUMN     "creativeVideoKey" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "fxPerUsd" DECIMAL(65,30),
ADD COLUMN     "pausedBy" TEXT,
ADD COLUMN     "rejectReasonCode" "RejectReason",
ADD COLUMN     "rewardCapPct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "rewardLocal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "keyCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "previousKeyHash" TEXT,
ADD COLUMN     "previousKeyValidUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "accountManager" TEXT NOT NULL DEFAULT 'Obinna A.',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "creditLimitCents" INTEGER NOT NULL DEFAULT 50000,
ADD COLUMN     "pointsPerShare" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "rewardCapPct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "rewardMaxPerSharerPerDay" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "termsDays" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPref" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("userId","workspaceId","kind")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "CreditRequestStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "CreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRevision" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'review',
    "rejectReasonCode" "RejectReason",
    "rejectReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "campaignId" TEXT,
    "invoiceId" TEXT,
    "dedupeKey" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "fxPerUsd" DECIMAL(65,30) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'open',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "placement" "Placement" NOT NULL,
    "cpmCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketFx" (
    "id" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "fxPerUsd" DECIMAL(65,30) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketFx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelShare" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "share" DECIMAL(65,30) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementStatement" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'open',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SettlementStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardPayout" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "sharerConsumerId" TEXT,
    "sharerSessionId" TEXT,
    "claimEventKey" TEXT NOT NULL,
    "amountLocal" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "RewardPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT,
    "sharerSessionId" TEXT,
    "campaignId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorAccount" (
    "id" TEXT NOT NULL DEFAULT 'reloadly',
    "balanceCents" INTEGER NOT NULL,

    CONSTRAINT "AggregatorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatorTopup" (
    "id" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatorTopup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ClaimCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_idx" ON "Invitation"("workspaceId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_at_idx" ON "AuditEvent"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CreditRequest_workspaceId_status_idx" ON "CreditRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CampaignRevision_campaignId_status_idx" ON "CampaignRevision"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_dedupeKey_key" ON "LedgerEntry"("dedupeKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_workspaceId_at_idx" ON "LedgerEntry"("workspaceId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_period_idx" ON "Invoice"("workspaceId", "period");

-- CreateIndex
CREATE INDEX "RateCard_channelId_country_placement_effectiveFrom_idx" ON "RateCard"("channelId", "country", "placement", "effectiveFrom");

-- CreateIndex
CREATE INDEX "MarketFx_country_effectiveFrom_idx" ON "MarketFx"("country", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ChannelShare_channelId_effectiveFrom_idx" ON "ChannelShare"("channelId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementStatement_channelId_period_key" ON "SettlementStatement"("channelId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "RewardPayout_claimEventKey_key" ON "RewardPayout"("claimEventKey");

-- CreateIndex
CREATE INDEX "RewardPayout_campaignId_status_idx" ON "RewardPayout"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCode_code_key" ON "ClaimCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCode_campaignId_channelId_sessionId_day_key" ON "ClaimCode"("campaignId", "channelId", "sessionId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_name_day_key" ON "JobRun"("name", "day");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRequest" ADD CONSTRAINT "CreditRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRevision" ADD CONSTRAINT "CampaignRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelShare" ADD CONSTRAINT "ChannelShare_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementStatement" ADD CONSTRAINT "SettlementStatement_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPayout" ADD CONSTRAINT "RewardPayout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPayout" ADD CONSTRAINT "RewardPayout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPayout" ADD CONSTRAINT "RewardPayout_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

