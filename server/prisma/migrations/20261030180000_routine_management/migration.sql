-- Training routines: lifecycle (DRAFT/ACTIVE/ARCHIVED), responsible instructor,
-- dated validity, immutable version snapshots and exercise tempo.
--
-- Existing routines keep working: `isActive` stays in sync with `status`, and
-- every existing row gets status ACTIVE/ARCHIVED from its current flag plus an
-- initial version 1 snapshot built from its own data.

CREATE TYPE "RoutineStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

ALTER TABLE "Routine"
    ADD COLUMN "status" "RoutineStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "instructorId" TEXT,
    ADD COLUMN "startDate" TIMESTAMP(3),
    ADD COLUMN "endDate" TIMESTAMP(3),
    ADD COLUMN "notes" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "Routine"
SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"RoutineStatus" ELSE 'ARCHIVED'::"RoutineStatus" END,
    "archivedAt" = CASE WHEN "isActive" THEN NULL ELSE "updatedAt" END;

ALTER TABLE "RoutineExercise" ADD COLUMN "tempo" VARCHAR(20);

CREATE TABLE "RoutineVersion" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RoutineStatus" NOT NULL,
    "reason" VARCHAR(40),
    "createdById" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoutineVersion_routineId_version_key" ON "RoutineVersion"("routineId", "version");
CREATE INDEX "RoutineVersion_gymId_routineId_idx" ON "RoutineVersion"("gymId", "routineId");
CREATE INDEX "RoutineVersion_gymId_createdAt_idx" ON "RoutineVersion"("gymId", "createdAt");

CREATE INDEX "Routine_gymId_status_idx" ON "Routine"("gymId", "status");
CREATE INDEX "Routine_gymId_assignedToId_status_idx" ON "Routine"("gymId", "assignedToId", "status");
CREATE INDEX "Routine_gymId_instructorId_idx" ON "Routine"("gymId", "instructorId");

-- At most one ACTIVE routine per member, enforced by the database itself.
CREATE UNIQUE INDEX "Routine_one_active_per_member"
    ON "Routine"("gymId", "assignedToId")
    WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

ALTER TABLE "RoutineVersion"
    ADD CONSTRAINT "RoutineVersion_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoutineVersion"
    ADD CONSTRAINT "RoutineVersion_routineId_fkey"
    FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineVersion"
    ADD CONSTRAINT "RoutineVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Routine"
    ADD CONSTRAINT "Routine_instructorId_fkey"
    FOREIGN KEY ("instructorId") REFERENCES "InstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Initial snapshot for routines that existed before versioning.
INSERT INTO "RoutineVersion" ("id", "gymId", "routineId", "version", "status", "reason", "createdById", "snapshot", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text || r."id"),
    r."gymId",
    r."id",
    1,
    r."status",
    'MIGRATION',
    r."createdBy",
    jsonb_build_object('name', r."name", 'description', r."description", 'days', '[]'::jsonb),
    r."createdAt"
FROM "Routine" r;
