import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  getReportMembers,
  getReportAttendance,
  getReportFinancial,
  getReportExport,
} from '../controllers/report-members.controller.js';
import { sendData } from './respond.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('GYM_ADMIN'));

// GET /api/v1/reports/members
reportsRouter.get('/members', sendData(getReportMembers));

// GET /api/v1/reports/attendance
reportsRouter.get('/attendance', sendData(getReportAttendance));

// GET /api/v1/reports/financial
reportsRouter.get('/financial', sendData(getReportFinancial));

// GET /api/v1/reports/export
// NOTE: the handler currently returns the report dataset as JSON (the PDF/XLSX
// rendering is still pending), so the export links use this same adapter.
reportsRouter.get('/export', sendData(getReportExport));

// GET /api/v1/reports/members/export (alias)
reportsRouter.get('/members/export', sendData(getReportExport));

// GET /api/v1/reports/attendance/export (alias)
reportsRouter.get('/attendance/export', sendData(getReportExport));

// GET /api/v1/reports/financial/export (alias)
reportsRouter.get('/financial/export', sendData(getReportExport));
