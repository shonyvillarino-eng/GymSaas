import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  createGym,
  getDashboard,
  getGymDetail,
  listGymActivity,
  listGymInstructors,
  listGymMembers,
  listGyms,
  reactivateGym,
  suspendGym,
  updateGym,
} from '../controllers/admin.controller.js';

/**
 * /api/v1/admin/* — platform administration.
 * Every route requires a valid session AND the SUPER_ADMIN role, resolved
 * from the database by requireAuth/requireRole (token role is never trusted).
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

adminRouter.get('/dashboard', getDashboard);

adminRouter.get('/gyms', listGyms);
adminRouter.post('/gyms', createGym);
adminRouter.get('/gyms/:id', getGymDetail);
adminRouter.patch('/gyms/:id', updateGym);
adminRouter.post('/gyms/:id/suspend', suspendGym);
adminRouter.post('/gyms/:id/reactivate', reactivateGym);
adminRouter.get('/gyms/:id/instructors', listGymInstructors);
adminRouter.get('/gyms/:id/members', listGymMembers);
adminRouter.get('/gyms/:id/activity', listGymActivity);
