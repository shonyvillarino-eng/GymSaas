import type { NotificationType, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { loadGymPreferences } from './gymPreferences.js';

/* ------------------------------------------------------------------ */
/* Message catalogue (recipient language > gym language > Spanish)     */
/* ------------------------------------------------------------------ */

type Language = 'es' | 'en' | 'pt';

function languageOf(userLanguage: string | null | undefined, gymLanguage: string | null | undefined): Language {
  const candidate = (userLanguage ?? gymLanguage ?? 'es').slice(0, 2).toLowerCase();
  return candidate === 'en' || candidate === 'pt' ? candidate : 'es';
}

function formatDate(date: Date, language: Language, timezone: string) {
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language === 'pt' ? 'pt-BR' : 'es-ES', {
      dateStyle: 'medium',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const MESSAGES = {
  es: {
    expiringTitle: 'Tu membresía está por vencer',
    expiringBody: (plan: string, date: string) => `Tu membresía ${plan} vence el ${date}. Renueva para seguir entrenando sin interrupciones.`,
    expiredTitle: 'Tu membresía venció',
    expiredBody: (plan: string, date: string) => `Tu membresía ${plan} venció el ${date}. Contacta al gimnasio para renovarla.`,
    paymentTitle: 'Pago registrado',
    paymentBody: (amount: string, concept: string) => `Se registró un pago de ${amount} por ${concept}.`,
    routineTitle: 'Nueva rutina asignada',
    routineUpdatedTitle: 'Rutina actualizada',
    routineBody: (name: string) => `La rutina «${name}» está disponible en tu portal.`,
  },
  en: {
    expiringTitle: 'Your membership is about to expire',
    expiringBody: (plan: string, date: string) => `Your ${plan} membership expires on ${date}. Renew to keep training without interruption.`,
    expiredTitle: 'Your membership expired',
    expiredBody: (plan: string, date: string) => `Your ${plan} membership expired on ${date}. Contact the gym to renew it.`,
    paymentTitle: 'Payment recorded',
    paymentBody: (amount: string, concept: string) => `A payment of ${amount} for ${concept} was recorded.`,
    routineTitle: 'New routine assigned',
    routineUpdatedTitle: 'Routine updated',
    routineBody: (name: string) => `The routine “${name}” is available in your portal.`,
  },
  pt: {
    expiringTitle: 'Sua matrícula está prestes a vencer',
    expiringBody: (plan: string, date: string) => `Sua matrícula ${plan} vence em ${date}. Renove para continuar treinando sem interrupções.`,
    expiredTitle: 'Sua matrícula venceu',
    expiredBody: (plan: string, date: string) => `Sua matrícula ${plan} venceu em ${date}. Entre em contato com a academia para renovar.`,
    paymentTitle: 'Pagamento registrado',
    paymentBody: (amount: string, concept: string) => `Um pagamento de ${amount} por ${concept} foi registrado.`,
    routineTitle: 'Novo treino atribuído',
    routineUpdatedTitle: 'Treino atualizado',
    routineBody: (name: string) => `O treino “${name}” está disponível no seu portal.`,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

type PreferenceKey = 'membershipAlerts' | 'routineAlerts' | 'paymentAlerts' | 'generalAlerts';

export interface NotifyInput {
  gymId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  dedupeKey: string;
  preferenceKey: PreferenceKey;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Creates one in-app notification, honouring the recipient's preferences.
 *
 * The unique `dedupeKey` makes repeated sweeps/publishes idempotent. An
 * email attempt is recorded as NOT_CONFIGURED — the project has no provider
 * configured, and pretending the message was sent would be false.
 */
export async function notifyUser(input: NotifyInput): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
    select: { inApp: true, email: true, membershipAlerts: true, routineAlerts: true, paymentAlerts: true, generalAlerts: true },
  });

  if (preference && !preference.inApp) return false;
  if (preference && !preference[input.preferenceKey]) return false;

  try {
    await prisma.notification.create({
      data: {
        gymId: input.gymId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    // Unique violation: the notification already exists (same event).
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return false;
    }
    throw error;
  }

  // Email is not implemented because no provider is configured. Record the
  // intent so the pending channel is visible instead of silently dropping it.
  if (preference?.email !== false) {
    await prisma.notificationLog.create({
      data: {
        gymId: input.gymId,
        userId: input.userId,
        type: input.type,
        channel: 'email',
        status: 'NOT_CONFIGURED',
        error: 'Email provider is not configured',
        metadata: { notificationKey: input.dedupeKey },
      },
    });
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Event hooks                                                         */
/* ------------------------------------------------------------------ */

export async function notifyPaymentRegistered(paymentId: string) {
  const payment = await prisma.paymentRecord.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      gymId: true,
      amount: true,
      currency: true,
      concept: true,
      status: true,
      member: { select: { user: { select: { id: true, language: true } } } },
      gym: { select: { language: true, timezone: true } },
    },
  });
  if (!payment || payment.status === 'VOIDED' || !payment.member?.user) return;

  const language = languageOf(payment.member.user.language, payment.gym.language);
  const messages = MESSAGES[language];
  const amount = `${Number(payment.amount).toFixed(2)} ${payment.currency}`;
  await notifyUser({
    gymId: payment.gymId,
    userId: payment.member.user.id,
    type: 'PAYMENT_REGISTERED',
    title: messages.paymentTitle,
    message: messages.paymentBody(amount, payment.concept),
    link: '/payments',
    dedupeKey: `payment:${payment.id}:registered`,
    preferenceKey: 'paymentAlerts',
    metadata: { paymentId: payment.id },
  });
}

export async function notifyPaymentVoided(paymentId: string) {
  const payment = await prisma.paymentRecord.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      gymId: true,
      amount: true,
      currency: true,
      concept: true,
      status: true,
      member: { select: { user: { select: { id: true, language: true } } } },
      gym: { select: { language: true } },
    },
  });
  if (!payment || payment.status !== 'VOIDED' || !payment.member?.user) return;

  const language = languageOf(payment.member.user.language, payment.gym.language);
  const amount = `${Number(payment.amount).toFixed(2)} ${payment.currency}`;
  const messages = {
    es: `El pago de ${amount} por ${payment.concept} fue anulado. El saldo pendiente se recalculó.`,
    en: `The payment of ${amount} for ${payment.concept} was voided. The outstanding balance was recalculated.`,
    pt: `O pagamento de ${amount} por ${payment.concept} foi anulado. O saldo pendente foi recalculado.`,
  }[language];
  const titles = { es: 'Pago anulado', en: 'Payment voided', pt: 'Pagamento anulado' };

  await notifyUser({
    gymId: payment.gymId,
    userId: payment.member.user.id,
    type: 'PAYMENT_VOIDED',
    title: titles[language],
    message: messages,
    link: '/payments',
    dedupeKey: `payment:${payment.id}:voided`,
    preferenceKey: 'paymentAlerts',
    metadata: { paymentId: payment.id },
  });
}

export async function notifyRoutineEvent(routineId: string, event: 'assigned' | 'updated') {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    select: {
      id: true,
      gymId: true,
      name: true,
      status: true,
      updatedAt: true,
      assignee: { select: { user: { select: { id: true, language: true } } } },
      gym: { select: { language: true } },
    },
  });
  if (!routine?.assignee?.user || routine.status !== 'ACTIVE') return;

  const language = languageOf(routine.assignee.user.language, routine.gym.language);
  const messages = MESSAGES[language];
  await notifyUser({
    gymId: routine.gymId,
    userId: routine.assignee.user.id,
    type: event === 'assigned' ? 'ROUTINE_ASSIGNED' : 'ROUTINE_UPDATED',
    title: event === 'assigned' ? messages.routineTitle : messages.routineUpdatedTitle,
    message: messages.routineBody(routine.name),
    link: '/routines',
    dedupeKey: `routine:${routine.id}:${event}:${routine.updatedAt.getTime()}`,
    preferenceKey: 'routineAlerts',
    metadata: { routineId: routine.id },
  });
}

/* ------------------------------------------------------------------ */
/* Scheduled membership sweep                                          */
/* ------------------------------------------------------------------ */

const SWEEP_LOCK_KEY = 915231;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * Detects memberships about to expire and recently expired memberships, and
 * creates idempotent notifications for their members.
 *
 * A PostgreSQL advisory lock makes the sweep safe with several server
 * instances: only one runs it at a time. Failures are logged and never stop
 * the server or affect API requests.
 */
export async function runNotificationSweep(now = new Date()) {
  let expiring = 0;
  let expired = 0;
  let acquired = false;
  try {
    // Acquired inside the try block: a database outage must be logged by the
    // caller instead of surfacing as an unhandled rejection from the timer.
    const lock = await prisma.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`;
    if (!lock[0]?.locked) return { skipped: true as const, expiring: 0, expired: 0 };
    acquired = true;
    const gyms = await prisma.gym.findMany({
      where: { isActive: true },
      select: { id: true, language: true, timezone: true, settings: true },
    });

    for (const gym of gyms) {
      const preferences = (await loadGymPreferences(gym.id))?.preferences;
      if (!preferences?.notifications.membershipExpiry) continue;

      const windowEnd = new Date(now.getTime() + preferences.membershipExpiryWarningDays * DAY_MS);
      const [expiringSoon, recentlyExpired] = await Promise.all([
        prisma.memberSubscription.findMany({
          where: { gymId: gym.id, status: 'ACTIVE', endDate: { gte: now, lte: windowEnd } },
          take: 500,
          select: {
            id: true,
            planNameAtPurchase: true,
            endDate: true,
            member: { select: { user: { select: { id: true, language: true } } } },
          },
        }),
        prisma.memberSubscription.findMany({
          where: {
            gymId: gym.id,
            status: 'EXPIRED',
            endDate: { gte: new Date(now.getTime() - 30 * DAY_MS), lt: now },
          },
          take: 500,
          select: {
            id: true,
            planNameAtPurchase: true,
            endDate: true,
            member: { select: { user: { select: { id: true, language: true } } } },
          },
        }),
      ]);

      for (const subscription of expiringSoon) {
        const user = subscription.member.user;
        if (!user) continue;
        const language = languageOf(user.language, gym.language);
        const messages = MESSAGES[language];
        const date = formatDate(subscription.endDate, language, gym.timezone);
        if (await notifyUser({
          gymId: gym.id,
          userId: user.id,
          type: 'MEMBERSHIP_EXPIRING',
          title: messages.expiringTitle,
          message: messages.expiringBody(subscription.planNameAtPurchase, date),
          link: '/membership',
          dedupeKey: `membership-expiring:${subscription.id}:${subscription.endDate.toISOString().slice(0, 10)}`,
          preferenceKey: 'membershipAlerts',
          metadata: { subscriptionId: subscription.id },
        })) expiring += 1;
      }

      for (const subscription of recentlyExpired) {
        const user = subscription.member.user;
        if (!user) continue;
        const language = languageOf(user.language, gym.language);
        const messages = MESSAGES[language];
        const date = formatDate(subscription.endDate, language, gym.timezone);
        if (await notifyUser({
          gymId: gym.id,
          userId: user.id,
          type: 'MEMBERSHIP_EXPIRED',
          title: messages.expiredTitle,
          message: messages.expiredBody(subscription.planNameAtPurchase, date),
          link: '/membership',
          dedupeKey: `membership-expired:${subscription.id}`,
          preferenceKey: 'membershipAlerts',
          metadata: { subscriptionId: subscription.id },
        })) expired += 1;
      }
    }
    return { skipped: false as const, expiring, expired };
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'notification_sweep_failed',
      message: error instanceof Error ? error.message : 'unknown',
    }));
    return { skipped: false as const, expiring, expired, error: true };
  } finally {
    // Only release the advisory lock if this connection acquired it.
    if (acquired) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`.catch(() => undefined);
    }
  }
}

/** Starts the sweep timer. Returns a stop function for graceful shutdown. */
export function startNotificationSweep() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationSweep();
    } catch (error) {
      // A scheduled failure must never stop the API process.
      console.error(JSON.stringify({
        level: 'error',
        event: 'notification_sweep_crashed',
        message: error instanceof Error ? error.message : 'unknown',
      }));
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(() => void tick(), 10_000);
  const timer = setInterval(() => void tick(), SWEEP_INTERVAL_MS);
  initial.unref();
  timer.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
