import { createLogEntry, safeStringify, env } from './logger.js';
const INFO = 'info';
const WARN = 'warn';
const ERROR = 'error';
function createRequestLoggerMiddleware() {
    return function requestLoggerMiddleware(req, res, next) {
        const start = Date.now();
        const reqId = req.requestId ?? crypto.randomUUID?.() ?? null;
        req.requestId = reqId;
        res.on('finish', () => {
            const dur = Date.now() - start;
            const isError = res.statusCode >= 500;
            const isWarn = !isError && res.statusCode >= 400;
            const level = isError ? ERROR : isWarn ? WARN : INFO;
            const ctx = createLogEntry({
                level,
                env: env.NODE_ENV,
                service: 'gym-saas',
                method: req.method,
                path: req.originalUrl.split('?')[0],
                statusCode: res.statusCode,
                durationMs: dur,
                requestId: reqId,
                userId: req.auth?.userId ?? null,
                errorType: isError ? res.errorType : undefined,
                message: isError ? res.errorMessage : undefined,
            });
            if (level === ERROR || level === WARN || env.NODE_ENV !== 'production') {
                if (level === ERROR) {
                    console.error(safeStringify(ctx));
                }
                else {
                    console.warn(safeStringify(ctx));
                }
            }
        });
        next();
    };
}
export { createRequestLoggerMiddleware as logRequest };
