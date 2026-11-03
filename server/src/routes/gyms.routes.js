import { Router } from 'express';
export const gymsRouter = Router();
/**
 * GET /api/v1/gyms
 * Listing and tenant-scoped CRUD are implemented in the tenancy feature stage.
 */
gymsRouter.get('/', async (_req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
});
