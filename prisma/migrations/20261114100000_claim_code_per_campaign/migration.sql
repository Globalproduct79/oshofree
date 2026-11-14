-- Claim codes are unique per campaign, not across the platform: a global space of 32^4 codes could be
-- exhausted by cheap anonymous claims. Every existing row already satisfies the narrower constraint.
-- DropIndex
DROP INDEX "ClaimCode_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCode_campaignId_code_key" ON "ClaimCode"("campaignId", "code");
