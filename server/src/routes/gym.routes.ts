import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  changeMyPassword,
  getMyGym,
  getMyPreferences,
  getMyProfile,
  listMyGymInstructors,
  updateMyGym,
  updateMyPreferences,
  updateMyProfile,
  uploadMyGymLogo,
} from '../controllers/gym.controller.js';

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
}).single('logo');

function parseLogo(req: Parameters<typeof logoUpload>[0], res: Parameters<typeof logoUpload>[1], next: Parameters<typeof logoUpload>[2]) {
  logoUpload(req, res, (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('Logo must be no larger than 2 MB.', 413));
      return;
    }
    if (error) {
      next(new AppError('Invalid logo upload.', 400));
      return;
    }
    next();
  });
}

export const gymRouter = Router();
gymRouter.use(requireAuth, requireRole('GYM_ADMIN'));

gymRouter.get('/', getMyGym);
gymRouter.patch('/', updateMyGym);
gymRouter.post('/logo', parseLogo, uploadMyGymLogo);
gymRouter.get('/instructors', listMyGymInstructors);
gymRouter.get('/preferences', getMyPreferences);
gymRouter.put('/preferences', updateMyPreferences);
gymRouter.get('/settings', getMyGym);
gymRouter.patch('/settings', updateMyGym);
gymRouter.get('/settings/localization', getMyGym);
gymRouter.patch('/settings/localization', updateMyGym);
gymRouter.get('/profile', getMyProfile);
gymRouter.patch('/profile', updateMyProfile);
gymRouter.put('/profile/password', changeMyPassword);
