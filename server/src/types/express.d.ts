import type { AuthPayload } from '../middlewares/auth.js';

/**
 * Única augmentación de `Request` del proyecto: `req.auth` lo pobló
 * `requireAuth` (middlewares/auth.ts) con el payload verificado contra la BD.
 * Declarado aquí para que cualquier módulo lea `req.auth` sin casts.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload | undefined;
    }
  }
}

export {};
