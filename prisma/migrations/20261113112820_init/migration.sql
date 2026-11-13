-- CreateEnum
CREATE TYPE "Country" AS ENUM ('NG', 'KE', 'GH', 'TZ', 'SN');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('Brand', 'Agency');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Owner', 'Manager', 'Viewer');

-- CreateEnum
CREATE TYPE "Placement" AS ENUM ('card', 'featured', 'video', 'splash');

-- CreateEnum
CREATE TYPE "RedeemMethod" AS ENUM ('code', 'link');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'review', 'live', 'paused', 'rejected');

-- CreateEnum
CREATE TYPE "SharerType" AS ENUM ('Root', 'Channel', 'Consumer');

-- CreateEnum
CREATE TYPE "ShareVia" AS ENUM ('whatsapp', 'sms', 'x', 'copy', 'other');

-- CreateEnum
CREATE TYPE "LinkEventType" AS ENUM ('Open', 'Claim', 'DetailsLeft');

-- CreateEnum
CREATE TYPE "ChannelEventType" AS ENUM ('Impression', 'Open', 'Claim', 'Share');

-- CreateEnum
CREATE TYPE "ReviewTarget" AS ENUM ('Workspace', 'Campaign');

-- CreateEnum
CREATE TYPE "ReviewVerb" AS ENUM ('Approve', 'Reject', 'Decline');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "country" "Country" NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'pending',
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Owner',

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "countries" "Country"[],

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "category" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "creativeImageKey" TEXT,
    "tileColor" TEXT,
    "placement" "Placement" NOT NULL,
    "redeemMethod" "RedeemMethod" NOT NULL,
    "claimCode" TEXT,
    "linkUrl" TEXT,
    "budgetUsd" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "shareRewardLabel" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "rejectReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL,
    "targetType" "ReviewTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "ReviewVerb" NOT NULL,
    "reason" TEXT,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL,
    "sharerType" "SharerType" NOT NULL,
    "sharerSessionId" TEXT,
    "consumerId" TEXT,
    "via" "ShareVia",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "type" "LinkEventType" NOT NULL,
    "visitorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "deduped" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "ChannelEventType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "linkCode" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "ChannelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelBatch" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accepted" INTEGER NOT NULL,
    "deduped" INTEGER NOT NULL,
    "ignored" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_key_key" ON "Channel"("key");

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_idx" ON "Campaign"("workspaceId");

-- CreateIndex
CREATE INDEX "Campaign_status_country_idx" ON "Campaign"("status", "country");

-- CreateIndex
CREATE INDEX "ReviewAction_targetType_targetId_idx" ON "ReviewAction"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_code_key" ON "ShareLink"("code");

-- CreateIndex
CREATE INDEX "ShareLink_campaignId_channelId_idx" ON "ShareLink"("campaignId", "channelId");

-- CreateIndex
CREATE INDEX "ShareLink_parentId_idx" ON "ShareLink"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Consumer_phone_key" ON "Consumer"("phone");

-- CreateIndex
CREATE INDEX "LinkEvent_linkId_type_idx" ON "LinkEvent"("linkId", "type");

-- CreateIndex
CREATE INDEX "ChannelEvent_campaignId_type_idx" ON "ChannelEvent"("campaignId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelEvent_channelId_dedupeKey_key" ON "ChannelEvent"("channelId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelBatch_channelId_key_key" ON "ChannelBatch"("channelId", "key");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEvent" ADD CONSTRAINT "LinkEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelEvent" ADD CONSTRAINT "ChannelEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelEvent" ADD CONSTRAINT "ChannelEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelBatch" ADD CONSTRAINT "ChannelBatch_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
