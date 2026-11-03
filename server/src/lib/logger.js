const SECRET_KEY_TOKENS = new Set([
    'password',
    'secret',
    'token',
    'key',
    'jwt',
    'cookie',
    'session',
]);
/* eslint-disable regexp/no-obscure-name */
const TSTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z?$/;
function isLikelySecretKey(key) {
    const k = key.toLowerCase();
    if (SECRET_KEY_TOKENS.has(k))
        return true;
    if (k.includes('__secret') || k.includes('__token') || k.includes('__key'))
        return true;
    return false;
}
function sanitizeValue(value) {
    if (value === null || value === undefined || value === '')
        return value;
    if (typeof value === 'string') {
        if (value.length > 400) {
            return `[REDACTED_${value.length}chars]`;
        }
        if (TSTAMP_RE.test(value) || /^[A-Za-z0-9+/=]{40,}$/.test(value)) {
            return value;
        }
    }
    return value;
}
export function safeStringify(obj, maxKeys = 64) {
    if (typeof obj !== 'object' || obj === null)
        return JSON.stringify(sanitizeValue(obj));
    const safe = sanitizeObject(obj, 0, maxKeys);
    try {
        return JSON.stringify(safe);
    }
    catch {
        return '[serialization_failed]';
    }
}
function sanitizeObject(obj, depth, maxDepth) {
    if (depth > maxDepth)
        return '[max_depth]';
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeValue(item));
    }
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        if (isLikelySecretKey(key)) {
            out[key] = '[redacted]';
            continue;
        }
        if (typeof value === 'object' && value !== null) {
            out[key] = sanitizeObject(value, depth + 1, maxDepth);
        }
        else {
            out[key] = sanitizeValue(value);
        }
    }
    return out;
}
export function requestId(req) {
    if (!req)
        return null;
    return req.requestId ?? null;
}
export function getNodeEnv() {
    return { NODE_ENV: process.env?.NODE_ENV || 'development' };
}
export const env = getNodeEnv();
export function createLogEntry(ctx) {
    const requestId = ctx.requestId ?? null;
    const plain = {
        level: ctx.level,
        env: ctx.env ?? env.NODE_ENV, // eslint-disable-line @typescript-eslint/naming-conflict
        service: ctx.service,
        'trace.id': requestId,
        method: ctx.method,
        path: ctx.path,
        statusCode: ctx.statusCode,
        userId: ctx.userId,
        durationMs: ctx.durationMs,
        errorType: ctx.errorType,
        ts: new Date().toISOString(),
        message: ctx.message,
        ...(ctx.meta != null ? { meta: ctx.meta } : {}),
    };
    return plain;
}
export const DEBUG = 'debug';
export const INFO = 'info';
export const WARN = 'warn';
export const ERROR = 'error';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export const env = getNodeEnv();
