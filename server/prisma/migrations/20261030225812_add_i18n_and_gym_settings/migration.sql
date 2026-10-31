-- DropIndex
DROP INDEX "InstructorProfile_gymId_status_idx";

-- DropIndex
DROP INDEX "MemberSubscription_gymId_planId_status_idx";

-- DropIndex
DROP INDEX "MemberSubscription_gymId_startDate_idx";

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "description" TEXT,
ADD COLUMN     "language" VARCHAR(10),
ADD COLUMN     "locale" VARCHAR(20),
ADD COLUMN     "website" VARCHAR(255);

-- AlterTable
ALTER TABLE "MemberSubscription" ALTER COLUMN "planNameAtPurchase" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" VARCHAR(10),
ADD COLUMN     "preferences" JSONB;
