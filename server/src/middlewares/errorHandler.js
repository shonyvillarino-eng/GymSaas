import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
export class AppError extends Error {
    status;
    details;
    constructor(message, status = 500, details) {
        super(message);
        this.status = status;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
export const errorHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
        res.status(400).json({
            error: 'Validation failed',
            details: err.flatten().fieldErrors,
        });
        return;
    }
    if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message, details: err.details });
        return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (!isProd) {
        // eslint-disable-next-line no-console
        console.error(err);
    }
    else if (status >= 500) {
        // Production: record the failure without the stack or request body, so an
        // operator can correlate it with the response's X-Request-Id header.
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({
            level: 'error',
            event: 'unhandled_error',
            request_id: req.requestId ?? null,
            method: req.method,
            path: req.originalUrl.split('?')[0],
            status,
            name: err instanceof Error ? err.name : 'Unknown',
        }));
    }
    res.status(status).json({
        error: status >= 500 ? 'Internal server error' : message,
        ...(isProd ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    });
};
