import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../middlewares/errorHandler.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  assignInstructorMember,
  assignInstructorMembersBulk,
  createInstructor,
  getInstructor,
  getInstructorMembers,
  instructorDashboard,
  instructorSelfMemberTraining,
  instructorSelfMembers,
  instructorSelfProfile,
  instructorSelfRoutines,
  listInstructors,
  listUnassignedMembers,
  removeInstructorMember,
  updateInstructor,
  updateInstructorStatus,
  uploadInstructorPhotoHandler,
} from '../controllers/instructor.controller.js';

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } }).single('photo');
function parsePhoto(req: Request, res: Response, next: NextFunction) {
  photoUpload(req, res, (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE') return next(new AppError('Photo must be no larger than 2 MB.', 413));
    if (error) return next(new AppError('Invalid photo upload.', 400));
    next();
  });
}

export const instructorsRouter = Router();
instructorsRouter.use(requireAuth);

instructorsRouter.get('/me/dashboard', requireRole('INSTRUCTOR'), instructorDashboard);
instructorsRouter.get('/me/members', requireRole('INSTRUCTOR'), instructorSelfMembers);
instructorsRouter.get('/me/members/:memberId/training', requireRole('INSTRUCTOR'), instructorSelfMemberTraining);
instructorsRouter.get('/me/routines', requireRole('INSTRUCTOR'), instructorSelfRoutines);
instructorsRouter.get('/me/profile', requireRole('INSTRUCTOR'), instructorSelfProfile);

instructorsRouter.use(requireRole('GYM_ADMIN'));
instructorsRouter.get('/', listInstructors);
instructorsRouter.post('/', createInstructor);
instructorsRouter.get('/unassigned-members', listUnassignedMembers);
instructorsRouter.post('/:id/photo', parsePhoto, uploadInstructorPhotoHandler);
instructorsRouter.post('/:id/members/bulk', assignInstructorMembersBulk);
instructorsRouter.get('/:id/members', getInstructorMembers);
instructorsRouter.post('/:id/members', assignInstructorMember);
instructorsRouter.delete('/:id/members/:memberId', removeInstructorMember);
instructorsRouter.get('/:id', getInstructor);
instructorsRouter.patch('/:id', updateInstructor);
instructorsRouter.patch('/:id/status', updateInstructorStatus);
