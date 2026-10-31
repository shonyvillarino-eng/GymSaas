import { Router } from 'express';

import { requireAuth } from '../middlewares/auth.js';
import { memberRoutines } from '../controllers/routine.controller.js';

/**
 * Mounted at `/api/v1/members/:memberId/routines`, before the members router.
 *
 * `mergeParams` is required so the controller receives `:memberId`. Authorization
 * lives in the controller: members only their own set, instructors only assigned
 * members, administrators only their gym.
 */
export const memberRoutinesRouter = Router({ mergeParams: true });
memberRoutinesRouter.use(requireAuth);
memberRoutinesRouter.get('/', (req, res) => memberRoutines(req, res));
