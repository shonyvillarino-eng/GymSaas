-- Attendance module: check-in capture (manual + QR), access results and the
-- per-member opaque QR credential.
--
-- Existing rows keep working: the free-text `method` column is converted to an
-- enum and anything unknown falls back to MANUAL, and every existing record is
-- treated as an ALLOWED entry.

CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'QR');

CREATE TYPE "AttendanceResult" AS ENUM ('ALLOWED', 'EXCEPTION');

ALTER TABLE "Attendance" ALTER COLUMN "method" DROP DEFAULT;

ALTER TABLE "Attendance"
    ALTER COLUMN "method" TYPE "AttendanceMethod"
    USING (CASE WHEN "method" = 'QR' THEN 'QR' ELSE 'MANUAL' END)::"AttendanceMethod";

ALTER TABLE "Attendance" ALTER COLUMN "method" SET DEFAULT 'MANUAL';

ALTER TABLE "Attendance"
    ADD COLUMN "result" "AttendanceResult" NOT NULL DEFAULT 'ALLOWED',
    ADD COLUMN "exceptionReason" VARCHAR(500),
    ADD COLUMN "membershipStatusAtCheckIn" VARCHAR(20);

CREATE INDEX "Attendance_gymId_method_idx" ON "Attendance"("gymId", "method");
CREATE INDEX "Attendance_gymId_result_idx" ON "Attendance"("gymId", "result");

-- Opaque, unique and nullable: a revoked credential leaves NULL behind and the
-- previous random value stops resolving to any member.
ALTER TABLE "MemberProfile"
    ADD COLUMN "qrToken" VARCHAR(64),
    ADD COLUMN "qrTokenCreatedAt" TIMESTAMP(3),
    ADD COLUMN "qrRevokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "MemberProfile_qrToken_key" ON "MemberProfile"("qrToken");
