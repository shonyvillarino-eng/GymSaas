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
 */
export function sendData(handler: DataHandler) {
  return async (req: Request, res: Response) => {
    const gymId = req.auth?.gymId;
    if (!gymId) {
      res.status(403).json({ error: 'Gym session required' });
      return;
    }
    const data = await handler({
      auth: { gymId, userId: req.auth?.userId ?? null },
      query: req.query as Record<string, unknown>,
    });
    res.json({ data });
  };
}
