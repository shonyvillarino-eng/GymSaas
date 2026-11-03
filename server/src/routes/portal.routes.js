import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
export const portalRouter = Router();
portalRouter.use(requireAuth);
// App-level portal entrypoint (placeholder for future portal routes).
portalRouter.get('/health', (_req, res) => {
    res.json({ portal: 'ok' });
});
