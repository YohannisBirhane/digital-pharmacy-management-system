-- Add persistent system configuration storage.
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "minimumOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "paymentMethods" JSONB NOT NULL,
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "businessName" TEXT NOT NULL DEFAULT 'Hanora Pharmacy',
    "businessEmail" TEXT NOT NULL DEFAULT 'support@hanora.com',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);