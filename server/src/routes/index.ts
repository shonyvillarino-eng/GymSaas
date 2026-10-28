import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { gymsRouter } from './gyms.routes.js';

export const apiRouter = Router();

/**
 * Feature routers are mounted here.
 * Each feature gets its own file: `*.routes.ts`.
 */
apiRouter.use('/auth', authRouter);
apiRouter.use('/gyms', gymsRouter);