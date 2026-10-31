import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  cashSummary,
  createPayment,
  downloadReceipt,
  financialDashboard,
  getPayment,
  listPayments,
  downloadMyReceipt,
  myPayments,
  voidPayment,
} from '../controllers/payment.controller.js';

/**
 * /api/v1/payments — administrative payment records.
 * The gym is always resolved from the session; amounts are never trusted from
 * the client. Registration and annulment are GYM_ADMIN-only operations.
 */
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

// Members consult only their own payments, read-only, including their PDF
// receipt; the member is resolved from the session, never from the URL.
paymentsRouter.get('/me', requireRole('MEMBER'), myPayments);
paymentsRouter.get('/me/:id/receipt', requireRole('MEMBER'), downloadMyReceipt);

paymentsRouter.use(requireRole('GYM_ADMIN'));

paymentsRouter.get('/dashboard', financialDashboard);
paymentsRouter.get('/cash-summary', cashSummary);
paymentsRouter.get('/', listPayments);
paymentsRouter.post('/', createPayment);
paymentsRouter.get('/:id', getPayment);
paymentsRouter.get('/:id/receipt', downloadReceipt);
paymentsRouter.post('/:id/void', voidPayment);
