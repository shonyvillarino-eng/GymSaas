-- Idempotency for generated notifications (announcements, expiry sweeps, payments).
-- Nullable: manually created notifications do not need a key.
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
