-- A campaign names the person who created it (Prompt 6): the member who submitted the New campaign form. Campaigns
-- from before this migration keep a NULL creator (no backfill: nothing recorded who made them), and deleting a user
-- sets their campaigns' creator to NULL rather than refusing or taking the campaigns with it.
-- Generated with `prisma migrate diff` from the previous schema to this one.
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
