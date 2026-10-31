-- Speed up the global membership lifecycle sweep, which filters only by
-- status + endDate / startDate (across all tenants) every minute.
CREATE INDEX "MemberSubscription_status_endDate_idx" ON "MemberSubscription"("status", "endDate");
CREATE INDEX "MemberSubscription_status_startDate_idx" ON "MemberSubscription"("status", "startDate");
