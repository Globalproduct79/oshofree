-- A revision that changes placement is priced when submitted (Phoenix rate then); approval copies it.
-- AlterTable
ALTER TABLE "CampaignRevision" ADD COLUMN     "cpmCents" INTEGER;
