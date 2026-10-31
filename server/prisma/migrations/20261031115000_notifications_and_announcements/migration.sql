-- Notification / announcement module.
-- These tables existed in schema.prisma but had no migration, so a clean
-- production database could not support the notification endpoints.

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'MEMBERSHIP_EXPIRING', 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP_RENEWED',
    'MEMBERSHIP_STATUS', 'ROUTINE_ASSIGNED', 'ROUTINE_UPDATED',
    'ROUTINE_REPLACED', 'PAYMENT_REGISTERED', 'PAYMENT_VOIDED',
    'PAYMENT_PENDING', 'ANNOUNCEMENT', 'GENERAL', 'INSTRUCTOR_NOTICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementAudience" AS ENUM (
    'ALL', 'MEMBERS', 'INSTRUCTORS', 'SPECIFIC_MEMBER', 'SPECIFIC_INSTRUCTOR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
  "targetUserId" TEXT,
  "publishAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "inApp" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT true,
  "membershipAlerts" BOOLEAN NOT NULL DEFAULT true,
  "routineAlerts" BOOLEAN NOT NULL DEFAULT true,
  "paymentAlerts" BOOLEAN NOT NULL DEFAULT true,
  "generalAlerts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'inapp',
  "status" TEXT NOT NULL,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE INDEX IF NOT EXISTS "Notification_gymId_userId_idx" ON "Notification"("gymId", "userId");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX IF NOT EXISTS "Announcement_gymId_status_idx" ON "Announcement"("gymId", "status");
CREATE INDEX IF NOT EXISTS "Announcement_publishAt_idx" ON "Announcement"("publishAt");
CREATE INDEX IF NOT EXISTS "NotificationPreference_gymId_idx" ON "NotificationPreference"("gymId");
CREATE INDEX IF NOT EXISTS "NotificationLog_gymId_createdAt_idx" ON "NotificationLog"("gymId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
