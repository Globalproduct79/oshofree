-- The rewards engine's per-claim lookups: a browser's own links and claims (same device, the friend's
-- number, phone reuse), a number's links, and a sharer's payouts today (the per-sharer caps).
-- CreateIndex
CREATE INDEX "LinkEvent_visitorId_idx" ON "LinkEvent"("visitorId");

-- CreateIndex
CREATE INDEX "RewardPayout_sharerConsumerId_createdAt_idx" ON "RewardPayout"("sharerConsumerId", "createdAt");

-- CreateIndex
CREATE INDEX "ShareLink_sharerSessionId_idx" ON "ShareLink"("sharerSessionId");

-- CreateIndex
CREATE INDEX "ShareLink_consumerId_idx" ON "ShareLink"("consumerId");
