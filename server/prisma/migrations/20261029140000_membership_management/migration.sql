CREATE TYPE "MembershipDurationUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR');

ALTER TABLE "MembershipPlan"
  ADD COLUMN "durationValue" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "durationUnit" "MembershipDurationUnit" NOT NULL DEFAULT 'MONTH',
  ADD COLUMN "conditions" TEXT;

ALTER TABLE "MemberSubscription"
  ADD COLUMN "planNameAtPurchase" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "currencyAtPurchase" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "assignedById" TEXT;

UPDATE "MemberSubscription" AS s
SET "finalPrice" = s."priceAtPurchase",
    "planNameAtPurchase" = p."name",
    "currencyAtPurchase" = p."currency"
FROM "MembershipPlan" AS p
WHERE p."id" = s."planId";

ALTER TABLE "MemberSubscription"
  ADD CONSTRAINT "MemberSubscription_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MemberSubscription_gymId_startDate_idx" ON "MemberSubscription"("gymId", "startDate");
CREATE INDEX "MemberSubscription_gymId_planId_status_idx" ON "MemberSubscription"("gymId", "planId", "status");
