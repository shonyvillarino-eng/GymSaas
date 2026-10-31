import { Router } from 'express';

import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  attendanceStats,
  getAttendance,
  getEligibility,
  getMemberCredential,
  getMyCredential,
  listAttendance,
  manualCheckIn,
  memberAttendance,
  myAttendance,
  qrCheckIn,
  regenerateMemberCredential,
  revokeMemberCredential,
} from '../controllers/attendance.controller.js';

/**
 * /api/v1/attendance — check-ins captured at the front desk.
 *
 * The gym always comes from the session. A QR payload only identifies a member
 * of that gym; it never grants access by itself — the same policy evaluation
 * runs for manual and QR entries.
 */
export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

/* Members consult only their own history and credential, read-only. */
attendanceRouter.get('/me', requireRole('MEMBER'), myAttendance);
attendanceRouter.get('/me/code', requireRole('MEMBER'), getMyCredential);

/* Reception desk. */
attendanceRouter.get('/stats', requireRole('GYM_ADMIN'), attendanceStats);
attendanceRouter.get('/eligibility', requireRole('GYM_ADMIN'), getEligibility);
attendanceRouter.post('/manual', requireRole('GYM_ADMIN'), manualCheckIn);
attendanceRouter.post('/qr', requireRole('GYM_ADMIN'), qrCheckIn);

/* QR credential management (rotate / revoke invalidates the previous code). */
attendanceRouter.get('/members/:memberId/code', requireRole('GYM_ADMIN'), getMemberCredential);
attendanceRouter.post('/members/:memberId/code', requireRole('GYM_ADMIN'), regenerateMemberCredential);
attendanceRouter.delete('/members/:memberId/code', requireRole('GYM_ADMIN'), revokeMemberCredential);

/* Admin history, plus instructors limited to their assigned members. */
attendanceRouter.get('/member/:memberId', requireRole('GYM_ADMIN', 'INSTRUCTOR'), memberAttendance);
attendanceRouter.get('/', requireRole('GYM_ADMIN'), listAttendance);
attendanceRouter.get('/:id', requireRole('GYM_ADMIN'), getAttendance);
