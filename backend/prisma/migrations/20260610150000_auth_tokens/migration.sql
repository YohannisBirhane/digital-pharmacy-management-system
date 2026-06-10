-- Add auth token support for password resets and email verification.
ALTER TABLE "User"
ADD COLUMN "verificationToken" TEXT,
ADD COLUMN "verificationExpires" TIMESTAMP(3),
ADD COLUMN "resetToken" TEXT,
ADD COLUMN "resetExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");