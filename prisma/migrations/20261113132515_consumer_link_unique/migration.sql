-- One Consumer link per (parent, consumer). Postgres treats NULLs as distinct, so Root links
-- (no parent) and Channel links (no consumer) are untouched.
-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_parentId_consumerId_key" ON "ShareLink"("parentId", "consumerId");
