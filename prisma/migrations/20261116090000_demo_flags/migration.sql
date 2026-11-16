-- Demo data is labelled (Prompt 9): the seed marks every workspace and user it creates, and nothing else ever does
-- (sign-up, an accepted invitation and the bootstrap all leave the default). The console marks a demo workspace with a
-- grey "Demo" pill, and `npm run demo:remove` deletes only these rows and what hangs off them. No backfill: rows from
-- before this migration are not demo until the database is reseeded.
-- Generated with `prisma migrate diff` from the previous schema to this one.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;
