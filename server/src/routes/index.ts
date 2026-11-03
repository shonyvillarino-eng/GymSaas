import { Router } from 'express';
import { healthRouter } from './health.routes.js'
import { metricsRouter } from './metrics.routes.js'
import { authRouter } from './auth.routes.js';
import { usersRouter } from './users.routes.js';
import { gymsRouter } from './gyms.routes.js';
import { membersRouter } from './members.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { reportsRouter } from './reports.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { memberRoutinesRouter } from './member-routines.routes.js';
import { portalRouter } from './portal.routes.js';
import { adminRouter } from './admin.routes.js';

export const apiRouter = Router()

apiRouter.use('/health', healthRouter);
apiRouter.use('/metrics', metricsRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/gyms', gymsRouter);
apiRouter.use('/members', membersRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/member-routines', memberRoutinesRouter);
apiRouter.use('/portal', portalRouter);
apiRouter.use('/admin', adminRouter);
