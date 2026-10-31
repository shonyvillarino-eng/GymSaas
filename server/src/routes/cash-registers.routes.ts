import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  closeCashRegister,
  getCashRegister,
  getCurrentCashRegister,
  listCashRegisters,
  openCashRegister,
} from '../controllers/cash-register.controller.js';

/**
 * /api/v1/cash-registers — administrative cash sessions for GYM_ADMIN.
 * Totals are recorded amounts, not verified physical cash.
 */
export const cashRegistersRouter = Router();
cashRegistersRouter.use(requireAuth, requireRole('GYM_ADMIN'));

cashRegistersRouter.get('/', listCashRegisters);
cashRegistersRouter.get('/current', getCurrentCashRegister);
cashRegistersRouter.post('/open', openCashRegister);
cashRegistersRouter.get('/:id', getCashRegister);
cashRegistersRouter.post('/:id/close', closeCashRegister);
