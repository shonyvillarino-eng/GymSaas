import type { Request, Response } from 'express';

export type DataHandler = (req: {
  auth: { gymId: string; userId?: string | null };
  query: Record<string, unknown>;
}) => Promise<unknown>;

/**
 * Adapts controllers that return their payload (instead of writing the
 * response) into Express handlers.
 *
 * The tenant always comes from the authenticated session, never from the
 * query string. A rejected handler is passed to the error middleware by
 * Express 5, so a failure can no longer leave the request hanging.
 *
 * `req.auth` lo puebla `requireAuth` (ver middlewares/auth.ts y la
 * augmentación global de Express.Request); `gymId` puede ser null hasta que
 * esta función lo exige y lo estrecha a `string`.
 */
export function sendData(handler: DataHandler) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.auth?.gymId) {
      res.status(403).json({ error: 'Gym session required' });
      return;
    }
    const { gymId, userId } = req.auth;
    const data = await handler({
      auth: { gymId, userId: userId ?? null },
      query: req.query as Record<string, unknown>,
    });
    res.json({ data });
  };
}
