-- The daily job acts as no user: its audit rows (invoices issued by the automatic month close) carry
-- a null actor. Deleting a user with audit rows is still refused.
-- AlterTable
ALTER TABLE "AuditEvent" ALTER COLUMN "actorId" DROP NOT NULL;
