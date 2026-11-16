-- Prompt 10: the prototype's fixed account manager ("Obinna A.") was never a person. A workspace names nobody until
-- Global approves it, and then the Global who did (lib/workspaces approveFrom); Global may name someone else later.
-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "accountManager" DROP NOT NULL,
ALTER COLUMN "accountManager" DROP DEFAULT;

-- A workspace still carrying the placeholder names the Global who last approved it, or nobody.
UPDATE "Workspace" w
SET "accountManager" = (
  SELECT u."name"
  FROM "ReviewAction" r
  JOIN "User" u ON u."id" = r."byUserId"
  WHERE r."targetType" = 'Workspace' AND r."targetId" = w."id" AND r."action" = 'Approve'
  ORDER BY r."at" DESC
  LIMIT 1
)
WHERE w."accountManager" = 'Obinna A.';
