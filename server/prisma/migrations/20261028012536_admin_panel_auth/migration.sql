-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('SETUP', 'RESET');

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "province" VARCHAR(80),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" VARCHAR(500);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "type" "AuthTokenType" NOT NULL DEFAULT 'SETUP',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "AuthToken"("userId");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: exactly ONE active GYM_ADMIN per gym (race-safe).
-- (Documented in prisma/DATA_MODEL.md; raw SQL because Prisma cannot express
-- filtered unique constraints natively.)
CREATE UNIQUE INDEX "GymMembership_one_active_admin_per_gym"
  ON "GymMembership"("gymId")
  WHERE "role" = 'GYM_ADMIN' AND "isActive" = true;
