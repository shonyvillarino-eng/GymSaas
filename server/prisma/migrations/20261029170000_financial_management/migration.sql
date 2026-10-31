-- Enrollment of the administrative finance module.
-- Enum value is added first and never referenced by the statements below, so the
-- migration stays valid inside a single transaction (PostgreSQL 12+).

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "FinancialObligation" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "concept" VARCHAR(200) NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(500),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialObligation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptCounter" (
    "gymId" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("gymId")
);

CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "expectedAmount" DECIMAL(12,2),
    "countedAmount" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentRecord"
    ADD COLUMN "obligationId" TEXT,
    ADD COLUMN "cashRegisterId" TEXT,
    ADD COLUMN "receiptNumber" VARCHAR(40),
    ADD COLUMN "voidedAt" TIMESTAMP(3),
    ADD COLUMN "voidedById" TEXT,
    ADD COLUMN "voidReason" VARCHAR(500);

-- Existing rows keep working: receipt numbers are assigned to historical rows so
-- the unique index can be created, and the counter continues after them.
ALTER TABLE "PaymentRecord"
    ADD COLUMN "_legacy_seq" INTEGER;

WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "gymId" ORDER BY "createdAt", "id") AS seq
    FROM "PaymentRecord"
    WHERE "receiptNumber" IS NULL
)
UPDATE "PaymentRecord" p
SET "receiptNumber" = 'R-' || LPAD(numbered.seq::TEXT, 6, '0'),
    "_legacy_seq" = numbered.seq
FROM numbered
WHERE p."id" = numbered."id";

ALTER TABLE "PaymentRecord" DROP COLUMN "_legacy_seq";

INSERT INTO "ReceiptCounter" ("gymId", "nextValue")
SELECT "gymId", COUNT(*) + 1
FROM "PaymentRecord"
WHERE "receiptNumber" IS NOT NULL
GROUP BY "gymId"
ON CONFLICT ("gymId") DO NOTHING;

ALTER TABLE "PaymentRecord" ALTER COLUMN "receiptNumber" SET NOT NULL;

CREATE UNIQUE INDEX "FinancialObligation_gymId_subscriptionId_concept_key"
    ON "FinancialObligation"("gymId", "subscriptionId", "concept");
CREATE INDEX "FinancialObligation_gymId_status_idx" ON "FinancialObligation"("gymId", "status");
CREATE INDEX "FinancialObligation_gymId_dueDate_idx" ON "FinancialObligation"("gymId", "dueDate");
CREATE INDEX "FinancialObligation_gymId_memberId_idx" ON "FinancialObligation"("gymId", "memberId");
CREATE INDEX "FinancialObligation_subscriptionId_idx" ON "FinancialObligation"("subscriptionId");

CREATE INDEX "CashRegister_gymId_status_idx" ON "CashRegister"("gymId", "status");
CREATE INDEX "CashRegister_gymId_openedAt_idx" ON "CashRegister"("gymId", "openedAt");

-- At most one open register per gym, enforced by the database itself.
CREATE UNIQUE INDEX "CashRegister_one_open_per_gym"
    ON "CashRegister"("gymId") WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "PaymentRecord_gymId_receiptNumber_key"
    ON "PaymentRecord"("gymId", "receiptNumber");
CREATE INDEX "PaymentRecord_obligationId_idx" ON "PaymentRecord"("obligationId");
CREATE INDEX "PaymentRecord_cashRegisterId_idx" ON "PaymentRecord"("cashRegisterId");

ALTER TABLE "FinancialObligation"
    ADD CONSTRAINT "FinancialObligation_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialObligation"
    ADD CONSTRAINT "FinancialObligation_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialObligation"
    ADD CONSTRAINT "FinancialObligation_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "MemberSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceiptCounter"
    ADD CONSTRAINT "ReceiptCounter_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashRegister"
    ADD CONSTRAINT "CashRegister_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashRegister"
    ADD CONSTRAINT "CashRegister_openedById_fkey"
    FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegister"
    ADD CONSTRAINT "CashRegister_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentRecord"
    ADD CONSTRAINT "PaymentRecord_obligationId_fkey"
    FOREIGN KEY ("obligationId") REFERENCES "FinancialObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord"
    ADD CONSTRAINT "PaymentRecord_cashRegisterId_fkey"
    FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord"
    ADD CONSTRAINT "PaymentRecord_voidedById_fkey"
    FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
