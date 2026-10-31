import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getMyPreferences, updateMyPreferences } from '../controllers/user.controller.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.get('/me/preferences', getMyPreferences);
usersRouter.patch('/me/preferences', updateMyPreferences);
