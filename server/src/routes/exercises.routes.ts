import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  createExercise,
  getExercise,
  listExercises,
  updateExercise,
  updateExerciseStatus,
} from '../controllers/exercise.controller.js';

/**
 * /api/v1/exercises — gym-scoped exercise catalog.
 * Administrators and instructors maintain it; the gym is always resolved from
 * the session, so a catalog of another gym is unreachable (404).
 */
export const exercisesRouter = Router();
exercisesRouter.use(requireAuth, requireRole('GYM_ADMIN', 'INSTRUCTOR'));

exercisesRouter.get('/', listExercises);
exercisesRouter.post('/', createExercise);
exercisesRouter.get('/:id', getExercise);
exercisesRouter.patch('/:id', updateExercise);
exercisesRouter.patch('/:id/status', updateExerciseStatus);
