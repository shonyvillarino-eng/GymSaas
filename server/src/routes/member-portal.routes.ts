import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  changePortalPassword,
  getPortalDashboard,
  getPortalMembership,
  getPortalMembershipHistory,
  getPortalProfile,
  getPortalRoutine,
  listPortalAttendances,
  listPortalNotifications,
  listPortalPayments,
  updatePortalProfile,
} from '../controllers/member-portal.controller.js';

/**
 * /api/v1/member-portal — the signed-in member's own workspace.
 *
 * The whole router is restricted to the MEMBER role, and every handler reads
 * the member from the session (`resolvePortalMember`). Attendances, memberships,
 * payments and routines are read-only here: no write route is registered.
 */
export const memberPortalRouter = Router();
memberPortalRouter.use(requireAuth, requireRole('MEMBER'));

memberPortalRouter.get('/dashboard', getPortalDashboard);

memberPortalRouter.get('/profile', getPortalProfile);
memberPortalRouter.patch('/profile', updatePortalProfile);
memberPortalRouter.patch('/password', changePortalPassword);

memberPortalRouter.get('/routine', getPortalRoutine);

memberPortalRouter.get('/attendances', listPortalAttendances);

memberPortalRouter.get('/membership', getPortalMembership);
memberPortalRouter.get('/membership/history', getPortalMembershipHistory);

memberPortalRouter.get('/payments', listPortalPayments);

memberPortalRouter.get('/notifications', listPortalNotifications);
