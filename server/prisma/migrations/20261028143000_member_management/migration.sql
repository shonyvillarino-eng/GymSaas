-- Member management: administrative status, document identity and join date.
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'CUIL', 'CUIT', 'PASSPORT', 'NATIONAL_ID', 'DRIVER_LICENSE', 'OTHER');

ALTER TABLE "MemberProfile"
  ADD COLUMN "documentType" "DocumentType",
  ADD COLUMN "documentNumber" VARCHAR(20),
  ADD COLUMN "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "address" VARCHAR(240);

-- Members are not required to provide an email address (login identity).
-- PostgreSQL unique indexes treat NULLs as distinct, so any number of
-- members without email can coexist.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- A document identifies a member only inside its own gym: the same
-- type+number may exist in other gyms.
CREATE UNIQUE INDEX "MemberProfile_gymId_documentType_documentNumber_key"
  ON "MemberProfile"("gymId", "documentType", "documentNumber");
CREATE INDEX "MemberProfile_gymId_status_idx" ON "MemberProfile"("gymId", "status");
CREATE INDEX "MemberProfile_gymId_joinDate_idx" ON "MemberProfile"("gymId", "joinDate");
