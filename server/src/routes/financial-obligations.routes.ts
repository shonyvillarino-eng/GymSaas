import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  cancelObligation,
  createObligation,
  generateObligations,
  getObligation,
  listObligations,
  myObligations,
} from '../controllers/obligation.controller.js';

/**
 * /api/v1/financial-obligations — receivables (charges a member owes).
 * Balances are derived from the payment movements, never stored as free input.
 */
export const financialObligationsRouter = Router();
financialObligationsRouter.use(requireAuth);

financialObligationsRouter.get('/me', requireRole('MEMBER'), myObligations);

financialObligationsRouter.use(requireRole('GYM_ADMIN'));

financialObligationsRouter.get('/', listObligations);
financialObligationsRouter.post('/', createObligation);
financialObligationsRouter.post('/generate', generateObligations);
financialObligationsRouter.get('/:id', getObligation);
financialObligationsRouter.patch('/:id/cancel', cancelObligation);
