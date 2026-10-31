import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  activateRoutine,
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  memberRoutines,
  myRoutines,
  routineHistory,
  updateRoutine,
} from '../controllers/routine.controller.js';

const READERS = ['GYM_ADMIN', 'INSTRUCTOR', 'MEMBER'] as const;
const WRITERS = ['GYM_ADMIN', 'INSTRUCTOR'] as const;

/**
 * /api/v1/routines — training routines.
 *
 * Reading is available to the three roles but scoped: members only see their
 * own routines, instructors only their assigned members, administrators only
 * their gym. Every write re-validates the tenant and the assignment.
 */
export const routinesRouter = Router();
routinesRouter.use(requireAuth);

routinesRouter.get('/me', requireRole('MEMBER'), myRoutines);
routinesRouter.get('/member/:memberId', requireRole('GYM_ADMIN', 'INSTRUCTOR'), (req, res) => memberRoutines(req, res));

routinesRouter.get('/', requireRole(...READERS), listRoutines);
routinesRouter.post('/', requireRole(...WRITERS), createRoutine);

routinesRouter.get('/:id', requireRole(...READERS), getRoutine);
routinesRouter.patch('/:id', requireRole(...WRITERS), updateRoutine);
routinesRouter.delete('/:id', requireRole(...WRITERS), deleteRoutine);
routinesRouter.get('/:id/history', requireRole(...READERS), routineHistory);
routinesRouter.post('/:id/activate', requireRole(...WRITERS), activateRoutine);
routinesRouter.post('/:id/archive', requireRole(...WRITERS), archiveRoutine);
