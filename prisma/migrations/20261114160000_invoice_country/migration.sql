-- An invoice keeps the billing country it was issued under: its currency and month stay as issued when Global
-- later moves the workspace to another market (spec §6.14.6: a country change applies from the next invoice).
-- Generated with `prisma migrate diff` (ADD COLUMN ... NOT NULL), split so existing invoices are backfilled from
-- their workspace before the column becomes required.
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "country" "Country";

UPDATE "Invoice" i SET "country" = w."country" FROM "Workspace" w WHERE i."workspaceId" = w."id";

ALTER TABLE "Invoice" ALTER COLUMN "country" SET NOT NULL;
