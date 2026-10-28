# GymFlow · Data Model Documentation

> Prisma schema → PostgreSQL, multi-tenant, production-ready.

## Entity Overview

| # | Model | Purpose | Key Constraints |
|---|-------|---------|-----------------|
| 1 | **Gym** | Tenant root (gymnasio) | `slug` unique, `isActive` |
| 2 | **User** | Credentials (global identity) | `email` unique, `role` enum |
| 3 | **GymMembership** | User ↔ Gym + role | *(gymId,userId)* unique, partial unique for 1 active admin |
| 4 | **MemberProfile** | Per-gym member details | `userId` unique (1 profile per user) |
| 5 | **InstructorProfile** | Per-gym instructor details | `userId` unique, `isAvailable` flag |
| 6 | **InstructorMember** | Instructor ↔ assigned member | *(gymId,instructorId,memberId)* unique, `isPrimary` flag |
| 7 | **MembershipPlan** | Pricing plan | *(gymId,name)* unique, `price` Decimal |
| 8 | **MemberSubscription** | Plan subscription | `status` enum, `startDate`,`endDate` |
| 9 | **PaymentRecord** | Manual payment history | `amount` Decimal(12,2), `method`,`status` enums, soft-delete |
| 10 | **Attendance** | Check-in history | *(gymId,memberId,checkInTime)* unique, soft-delete |
| 11 | **Routine** | Training routine | `difficulty` enum, soft-delete |
| 12 | **RoutineDay** | Session/day in a routine | *(routineId,dayOrder)* unique |
| 13 | **Exercise** | Exercise catalog | *(gymId,name)* unique, `isPublic` flag |
| 14 | **RoutineExercise** | Day ↔ exercise link | *(routineDayId,exerciseId,exerciseOrder)* unique, `sets`,`reps`,`restSeconds` |
| 15 | **ProgressRecord** | Physical evaluations | `metric` enum, `value` Decimal, measuredAt |
| 16 | **AuditLog** | Operation audit trail | Append-only, `action`,`entityType` enums |

---

## Enums (state modelling consistency)

| Enum | Values |
|------|--------|
| `UserRole` | SUPER_ADMIN, GYM_ADMIN, INSTRUCTOR, MEMBER |
| `SubscriptionStatus` | ACTIVE, EXPIRED, CANCELLED, PENDING, FROZEN |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED, PARTIAL |
| `PaymentMethod` | CASH, CARD, TRANSFER, BANK_TRANSFER, CHECK, OTHER |
| `AttendanceStatus` | PRESENT, ABSENT, LATE, CANCELLED, EXCUSED |
| `FitnessLevel` | BEGINNER, INTERMEDIATE, ADVANCED |
| `DifficultyLevel` | EASY, MEDIUM, HARD, EXTREME |
| `MuscleGroup` | CHEST, BACK, LEGS, SHOULDERS, ARMS, CORE, GLUTES, FULL_BODY, CARDIO, OTHER |
| `ExerciseType` | STRENGTH, CARDIO, FLEXIBILITY, BALANCE, PLYOMETRICS, OTHER |
| `Gender` | MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY |
| `AuditAction` | CREATE, UPDATE, DELETE, RESTORE, LOGIN, LOGOUT, EXPORT, IMPORT, ASSIGN, UNASSIGN, PAYMENT_REGISTERED, ATTENDANCE_MARKED, ROUTINE_ASSIGNED |
| `ProgressMetric` | WEIGHT, BODY_FAT, MUSCLE_MASS, CHEST, WAIST, HIPS, BICEPS, THIGH, HEIGHT, BMI, OTHER |

---

## Multi-Tenant Security Model

**Core rule:** The `gymId` must be derived from the **authenticated session (JWT payload)**, never from a client-supplied query/body param.

### Data isolation pattern

```typescript
// ✅ CORRECT: scoped query
async function getMembersForGym(gymId: string) {
  return prisma.memberProfile.findMany({ where: { gymId } });
}

// ❌ NEVER: trust client gymId
async function getMembersByClientParam(req: Request) {
  return prisma.memberProfile.findMany({ where: { gymId: req.query.gymId } });
}
```

### What the schema enforces

- Every tenant-scoped model carries `gymId: String` (non-nullable) + FK to `Gym`.
- Composite indexes like `@@index([gymId, status])` make scoped queries efficient.
- Unique constraints scoped to gym prevent cross-tenant collisions.

### What must be enforced at query time (middleware)

- Extract `gymId` from verified JWT on every request.
- Attach to `req.context.gymId`.
- All controllers read from `req.context.gymId`.
- `SUPER_ADMIN` role bypasses gym scoping (platform admin).

---

## Referential Actions

| Relationship | onDelete | Why |
|-------------|----------|-----|
| Gym → GymMembership/MemberProfile/etc. | **Cascade** | Delete gym removes operational data |
| Gym → PaymentRecord/Attendance | **Restrict** | Financial/attendance history is immutable |
| User → User.id (PaymentRegistrar) | **SetNull** | User deletion doesn't destroy payment records |
| MembershipPlan → MemberSubscription | **Restrict** | Don't orphan active subscriptions |
| Gym → AuditLog | **Cascade** | Audit logs are gym-scoped |

---

## Key Constraints & Unique Indexes

### Partial unique index (raw SQL in migration)
```sql
-- Exactly ONE active GYM_ADMIN per gym
CREATE UNIQUE INDEX "GymMembership_one_active_admin_per_gym"
  ON "GymMembership"("gymId")
  WHERE "role" = 'GYM_ADMIN' AND "isActive" = true;
```

### Standard unique constraints
- `Gym.slug` — tenant URL identifier
- `User.email` — global identity
- `GymMembership(gymId, userId)` — one membership per user per gym
- `MemberProfile.userId` — one profile per user (across all gyms)
- `InstructorProfile.userId` — one instructor profile per user
- `InstructorMember(gymId, instructorId, memberId)` — no duplicate assignments
- `MembershipPlan(gymId, name)` — no duplicate plan names per gym
- `Exercise(gymId, name)` — no duplicate exercise names per gym
- `Attendance(gymId, memberId, checkInTime)` — no duplicate check-ins
- `RoutineDay(routineId, dayOrder)` — unique order per routine
- `RoutineExercise(routineDayId, exerciseId, exerciseOrder)` — unique exercise slot

---

## Financial & Historical Data Policy

- **PaymentRecord** and **Attendance** use `deletedAt: DateTime?` (soft delete).
- `amount` uses `Decimal(12,2)` — never `Float`.
- DELETE operations on `Gym` **RESTRICT**ed if payments/attendance exist.
- All `_at` timestamps are `DateTime @default(now())`.

---

## Indexes for Query Performance

**High-traffic patterns:**
- `@@index([gymId, isActive])` on Gym — list active gyms
- `@@index([gymId, role])` on GymMembership — RBAC checks
- `@@index([gymId, status])` on MemberSubscription — filter active subs
- `@@index([gymId, paidAt])` on PaymentRecord — payment history range queries
- `@@index([gymId, checkInTime])` on Attendance — attendance graphs
- `@@index([gymId, metric])` on ProgressRecord — progress charts
- `@@index([gymId, createdAt])` on AuditLog — audit timeline

---

## ER Diagram (textual)

```
Gym ──┬─< GymMembership >── User
      ├─< MemberProfile >── User
      ├─< InstructorProfile >── User
      ├─< MembershipPlan
      │    └─< MemberSubscription >── MemberProfile
      │         └─< PaymentRecord >── User (registrar)
      ├─< InstructorMember (InstructorProfile ↔ MemberProfile)
      ├─< Attendance >── MemberProfile
      ├─< Routine >── User (creator), MemberProfile (assignee)
      │    └─< RoutineDay
      │         └─< RoutineExercise >── Exercise
      ├─< Exercise >── User (creator)
      ├─< ProgressRecord >── MemberProfile, User (recordedBy)
      └─< AuditLog >── User
```

---

## Migration

```bash
# Apply pending migrations
npm run db:migrate --workspace server       # (migrate dev for local)

# Or deploy to existing DB
npx prisma migrate deploy                   # from /server

# Generate Prisma client after schema changes
npx prisma generate                         # from /server
```

**Migration:** `prisma/migrations/20261027_init_multi_tenant_schema/migration.sql`

---

## Seeding (development)

```bash
npx tsx prisma/seed.ts     # from /server
```

Creates: `demo-gym`, `admin@demo.local`, `Basic` plan.

---

## Pending (future stages)

- [ ] Auth middleware (JWT → `req.context.gymId`)
- [ ] Role-based access control middleware
- [ ] RBAC enforcement in controllers
- [ ] Tenant-scoped query wrappers
- [ ] AuditLog writer middleware