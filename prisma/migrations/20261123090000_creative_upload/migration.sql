-- Slice 2, Prompt 2: who uploaded each creative file, so a file the form replaced or removed can be deleted by the
-- person who sent it (and only while no campaign or pending revision names it). Files uploaded before this have no
-- row and are never deleted through it.
-- CreateTable
CREATE TABLE "CreativeUpload" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeUpload_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CreativeUpload_userId_idx" ON "CreativeUpload"("userId");
