-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "pharmacyName" TEXT,
ADD COLUMN "pharmacyLocation" TEXT,
ADD COLUMN "licenseNumber" TEXT,
ADD COLUMN "nationalId" TEXT,
ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_licenseNumber_key" ON "User"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_nationalId_key" ON "User"("nationalId");