-- Add city and status fields to branches for real branch management.
ALTER TABLE "Branch"
ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';