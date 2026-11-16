-- Recent activity (Prompt 8) reads a campaign's events newest first a page at a time, and walks its impressions hour by
-- hour back from a cursor: both are index scans on (campaign, type, at) that stop after the page.
-- CreateIndex
CREATE INDEX "ChannelEvent_campaignId_type_at_idx" ON "ChannelEvent"("campaignId", "type", "at");
