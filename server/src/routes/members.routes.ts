import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  assignMemberInstructor,
  createMember,
  getMember,
  getMemberSummary,
  grantMemberPortalAccess,
  listMembers,
  updateMember,
  updateMemberStatus,
  uploadMemberPhotoHandler,
} from '../controllers/member.controller.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
}).single('photo');

function parsePhoto(req: Parameters<typeof photoUpload>[0], res: Parameters<typeof photoUpload>[1], next: Parameters<typeof photoUpload>[2]) {
  photoUpload(req, res, (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('Photo must be no larger than 2 MB.', 413));
      return;
    }
    if (error) {
      next(new AppError('Invalid photo upload.', 400));
      return;
    }
    next();
  });
}

/**
 * /api/v1/members/* — member management for the tenant's GYM_ADMIN.
 * The gym always comes from the authenticated session; every query is
 * scoped by gymId, so members of other gyms are invisible (404).
 */
export const membersRouter = Router();
membersRouter.use(requireAuth, requireRole('GYM_ADMIN'));

membersRouter.get('/', listMembers);
membersRouter.post('/', createMember);
membersRouter.get('/:id', getMember);
membersRouter.patch('/:id', updateMember);
membersRouter.patch('/:id/status', updateMemberStatus);
membersRouter.get('/:id/summary', getMemberSummary);
membersRouter.put('/:id/instructor', assignMemberInstructor);
membersRouter.post('/:id/photo', parsePhoto, uploadMemberPhotoHandler);
// Issues a one-time invitation so the member can sign in to the portal.
membersRouter.post('/:id/portal-access', grantMemberPortalAccess);
