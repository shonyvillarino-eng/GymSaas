import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  getReportMembers,
  getReportAttendance,
  getReportFinancial,
  exportReport,
} from '../controllers/report-members.controller.js';
import { sendData } from './respond.js';

export const reportsRouter = Router();

// Administrative reports: GYM_ADMIN of the authenticated gym only. The gymId
// is read from the session by every handler, never from the query string.
reportsRouter.use(requireAuth, requireRole('GYM_ADMIN'));

// GET /api/v1/reports/members
reportsRouter.get('/members', sendData(getReportMembers));

// GET /api/v1/reports/attendance
reportsRouter.get('/attendance', sendData(getReportAttendance));

// GET /api/v1/reports/financial
reportsRouter.get('/financial', sendData(getReportFinancial));

// GET /api/v1/reports/export?report=members|attendance|financial&format=pdf|xlsx
// Returns the generated file with Content-Type and Content-Disposition.
reportsRouter.get('/export', exportReport);

// Aliases kept for the existing frontend links.
reportsRouter.get('/members/export', exportReport);
reportsRouter.get('/attendance/export', exportReport);
reportsRouter.get('/financial/export', exportReport);
