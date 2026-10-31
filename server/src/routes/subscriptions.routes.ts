import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { assignSubscription, cancelSubscription, getSubscription, listSubscriptions, memberSelfSubscriptions, memberSubscriptionHistory, renewSubscription, upcomingExpirations } from '../controllers/membership.controller.js';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAuth);
subscriptionsRouter.get('/me', requireRole('MEMBER'), memberSelfSubscriptions);
subscriptionsRouter.use(requireRole('GYM_ADMIN'));
subscriptionsRouter.get('/dashboard', upcomingExpirations);
subscriptionsRouter.get('/upcoming', upcomingExpirations);
subscriptionsRouter.get('/member/:id', memberSubscriptionHistory);
subscriptionsRouter.get('/', listSubscriptions);
subscriptionsRouter.post('/', assignSubscription);
subscriptionsRouter.get('/:id', getSubscription);
subscriptionsRouter.post('/:id/renew', renewSubscription);
subscriptionsRouter.patch('/:id/cancel', cancelSubscription);
