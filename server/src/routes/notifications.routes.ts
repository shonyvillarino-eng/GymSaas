import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getAnnouncements,
  manageAnnouncements,
  createAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from '../controllers/notification.controller.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// User notifications
notificationsRouter.get('/', getNotifications);
notificationsRouter.get('/unread-count', getUnreadCount);
notificationsRouter.patch('/:id/read', markAsRead);
notificationsRouter.patch('/read-all', markAllAsRead);

// Announcements
notificationsRouter.get('/announcements', getAnnouncements);
notificationsRouter.get('/announcements/manage', requireRole('GYM_ADMIN'), manageAnnouncements);
notificationsRouter.post('/announcements', requireRole('GYM_ADMIN'), createAnnouncement);
notificationsRouter.post('/announcements/:id/publish', requireRole('GYM_ADMIN'), publishAnnouncement);
notificationsRouter.post('/announcements/:id/archive', requireRole('GYM_ADMIN'), archiveAnnouncement);

// Preferences
notificationsRouter.get('/preferences', getMyNotificationPreferences);
notificationsRouter.patch('/preferences', updateMyNotificationPreferences);
