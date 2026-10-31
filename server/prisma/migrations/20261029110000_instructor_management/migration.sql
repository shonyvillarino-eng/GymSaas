-- Instructor management builds on the existing InstructorProfile and InstructorMember tables.
CREATE TYPE "InstructorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
ALTER TYPE "AuthTokenType" ADD VALUE 'INSTRUCTOR_INVITE';

ALTER TABLE "InstructorProfile"
  ADD COLUMN "documentType" "DocumentType",
  ADD COLUMN "documentNumber" VARCHAR(30),
  ADD COLUMN "birthDate" TIMESTAMP(3),
  ADD COLUMN "address" VARCHAR(240),
  ADD COLUMN "notes" VARCHAR(1000),
  ADD COLUMN "status" "InstructorStatus" NOT NULL DEFAULT 'ACTIVE';

-- Historical assignment rows remain in place. Duplicate active pairs are prevented,
-- while terminated assignments can later be re-opened without deleting history.
DROP INDEX IF EXISTS "InstructorMember_gymId_instructorId_memberId_key";
CREATE UNIQUE INDEX "InstructorMember_active_pair_key"
  ON "InstructorMember"("gymId", "instructorId", "memberId") WHERE "isActive" = true;
CREATE UNIQUE INDEX "InstructorMember_one_primary_member_key"
  ON "InstructorMember"("gymId", "memberId") WHERE "isActive" = true AND "isPrimary" = true;
CREATE INDEX "InstructorProfile_gymId_status_idx" ON "InstructorProfile"("gymId", "status");
