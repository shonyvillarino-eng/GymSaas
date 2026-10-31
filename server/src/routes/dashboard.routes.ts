import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  getDashboardOverview,
  getDashboardAttendance,
  getDashboardRevenue,
  getDashboardMemberships,
} from '../controllers/dashboard.controller.js';
import { sendData } from './respond.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole('GYM_ADMIN'));

// GET /api/v1/dashboard/overview — métricas globales del gimnasio
dashboardRouter.get('/overview', sendData(getDashboardOverview));

// GET /api/v1/dashboard/attendance — estadísticas de asistencia
dashboardRouter.get('/attendance', sendData(getDashboardAttendance));

// GET /api/v1/dashboard/revenue — ingresos y pagos
dashboardRouter.get('/revenue', sendData(getDashboardRevenue));

// GET /api/v1/dashboard/memberships — membresías por período
dashboardRouter.get('/memberships', sendData(getDashboardMemberships));
