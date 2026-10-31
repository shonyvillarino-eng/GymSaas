import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { createPlan, getPlan, listPlans, setPlanStatus, updatePlan } from '../controllers/membership.controller.js';

export const membershipPlansRouter = Router();
membershipPlansRouter.use(requireAuth, requireRole('GYM_ADMIN'));
membershipPlansRouter.get('/', listPlans);
membershipPlansRouter.post('/', createPlan);
membershipPlansRouter.get('/:id', getPlan);
membershipPlansRouter.patch('/:id', updatePlan);
membershipPlansRouter.patch('/:id/status', setPlanStatus);
