import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import { listAuditLogs } from '../controllers/audit.controller.js';

/**
 * Read-only audit trail.
 *
 * GYM_ADMIN: only rows of the session gym (the controller ignores any gymId
 * query parameter). SUPER_ADMIN: global view, optionally filtered by gym.
 * There is deliberately no write route: the trail is append-only.
 */
export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('GYM_ADMIN', 'SUPER_ADMIN'));
auditRouter.get('/', listAuditLogs);
