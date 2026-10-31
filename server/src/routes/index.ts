import { Router } from 'express';

import { adminRouter } from './admin.routes.js';
import { authRouter } from './auth.routes.js';
import { gymsRouter } from './gyms.routes.js';
import { gymRouter } from './gym.routes.js';
import { usersRouter } from './users.routes.js';
import { membersRouter } from './members.routes.js';
import { instructorsRouter } from './instructors.routes.js';
import { membershipPlansRouter } from './membership-plans.routes.js';
import { subscriptionsRouter } from './subscriptions.routes.js';
import { paymentsRouter } from './payments.routes.js';
import { financialObligationsRouter } from './financial-obligations.routes.js';
import { cashRegistersRouter } from './cash-registers.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { exercisesRouter } from './exercises.routes.js';
import { routinesRouter } from './routines.routes.js';
import { memberRoutinesRouter } from './member-routines.routes.js';
import { memberPortalRouter } from './member-portal.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { reportsRouter } from './reports.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { auditRouter } from './audit.routes.js';

export const apiRouter = Router();

/**
 * Feature routers are mounted here.
 * Each feature gets its own file: `*.routes.ts`.
 */
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/gym', gymRouter);
apiRouter.use('/users', usersRouter);
// Mounted before `/members` so the members router's GYM_ADMIN guard does not
// swallow the member-facing routines route.
apiRouter.use('/members/:memberId/routines', memberRoutinesRouter);
apiRouter.use('/members', membersRouter);
apiRouter.use('/instructors', instructorsRouter);
apiRouter.use('/membership-plans', membershipPlansRouter);
apiRouter.use('/subscriptions', subscriptionsRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/financial-obligations', financialObligationsRouter);
apiRouter.use('/cash-registers', cashRegistersRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/exercises', exercisesRouter);
apiRouter.use('/routines', routinesRouter);
apiRouter.use('/member-portal', memberPortalRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/gyms', gymsRouter);
