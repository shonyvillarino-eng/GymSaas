import { Router } from 'express';
import { checkReadiness } from '../lib/readiness.js';
const MAX_ROUTE_CARDINALITY = 500;
const rawRoutedPaths = new Set();
function normalizeRoute(rawRoute) {
    for (const template of rawRoutedPaths) {
        if (template.length > rawRoute.length)
            continue;
        let ti = 0;
        let ri = 0;
        let matched = true;
        while (ti < template.length && ri < rawRoute.length) {
            if (template[ti] === rawRoute[ri]) {
                ti++;
                ri++;
                continue;
            }
            if (template[ti] === ':' && (rawRoute[ri] === '/' || rawRoute[ri] === '')) {
                matched = false;
                break;
            }
            if (template[ti] === ':') {
                while (ti < template.length && template[ti] !== '/')
                    ti++;
                if (ti < template.length)
                    ti++;
                continue;
            }
            matched = false;
            break;
        }
        if (matched && ti === template.length && (ri === rawRoute.length || rawRoute[ri] === '/')) {
            let normalized = '';
            let ti2 = 0;
            let ri2 = 0;
            while (ti2 < template.length) {
                if (template[ti2] === ':') {
                    while (ti2 < template.length && template[ti2] !== '/')
                        ti2++;
                    normalized += ':id';
                    if (ti2 < template.length) {
                        ti2++;
                        normalized += '/';
                    }
                    continue;
                }
                normalized += template[ti2];
                ti2++;
            }
            return normalized;
        }
    }
    return rawRoute;
}
export function registerRoutedPath(raw) {
    rawRoutedPaths.add(raw);
    if (rawRoutedPaths.size > MAX_ROUTE_CARDINALITY) {
        const first = rawRoutedPaths.values().next().value;
        if (first !== undefined)
            rawRoutedPaths.delete(first);
    }
}
const REQUESTS_CAP = 200_000;
const requestBuffer = [];
let writeIndex = 0;
let requestCount = 0;
const inFlightMap = new Map();
let inFlightTotal = 0;
let okTotal = 0;
let errorsTotal = 0;
let slowTotal = 0;
const byRoute = {};
const byStatus = {};
function bumpInFlight(key) {
    const current = inFlightMap.get(key) ?? 0;
    inFlightMap.set(key, current + 1);
    inFlightTotal++;
}
function lowerInFlight(key) {
    const current = inFlightMap.get(key) ?? 0;
    if (current <= 1)
        inFlightMap.delete(key);
    else
        inFlightMap.set(key, current - 1);
    inFlightTotal = Math.max(0, inFlightTotal - 1);
}
export function resetMetricsStore() {
    requestBuffer.length = 0;
    writeIndex = 0;
    requestCount = 0;
    inFlightMap.clear();
    rawRoutedPaths.clear();
    inFlightTotal = 0;
    okTotal = 0;
    errorsTotal = 0;
    slowTotal = 0;
    for (const k of Object.keys(byRoute))
        delete byRoute[k];
    for (const k of Object.keys(byStatus))
        delete byStatus[k];
}
export function metricsMiddleware(req, res, next) {
    const startedAt = Date.now();
    const key = `${req.method} ${normalizeRoute(req.route?.path ?? '')}`;
    bumpInFlight(key);
    res.on('finish', () => {
        const duration = Math.max(0, Date.now() - startedAt);
        const status = res.statusCode;
        lowerInFlight(key);
        if (writeIndex < requestBuffer.length) {
            requestBuffer[writeIndex % REQUESTS_CAP] = {
                method: req.method,
                route: key,
                status,
                duration_ms: duration,
                startedAt,
                finishedAt: Date.now(),
            };
        }
        else if (writeIndex < REQUESTS_CAP) {
            requestBuffer.push({
                method: req.method,
                route: key,
                status,
                duration_ms: duration,
                startedAt,
                finishedAt: Date.now(),
            });
        }
        writeIndex++;
        requestCount = Math.max(requestCount, writeIndex);
        if (status >= 400)
            errorsTotal++;
        else
            okTotal++;
        if (duration >= 1000)
            slowTotal++;
        const cell = byRoute[key] ??= { count: 0, errors: 0, slow: 0, latency_sum_ms: 0, latency_max_ms: 0 };
        cell.count++;
        cell.latency_sum_ms += duration;
        if (duration > cell.latency_max_ms)
            cell.latency_max_ms = duration;
        if (status >= 400)
            cell.errors++;
        if (duration >= 1000)
            cell.slow++;
        const statusKey = String(status);
        byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;
    });
    next();
}
export const metricsRouter = Router();
metricsRouter.get('/health', async (_req, res) => {
    const ready = await checkReadiness();
    res.json({
        status: ready.ready ? 'ok' : 'error',
        ready: ready.ready,
        timestamp: new Date().toISOString(),
        message: ready.message,
        database: ready.ready
            ? { connected: true, latencyMs: ready.latencyMs }
            : { connected: false, error: ready.error },
    });
});
metricsRouter.get('/', async (_req, res) => {
    const snapshot = {
        in_flight: inFlightTotal,
        total_requests: requestCount,
        ok: okTotal,
        errors: errorsTotal,
        slow: slowTotal,
        by_route: byRoute,
        status_codes: byStatus,
        window_start_ms: Date.now() - 60_000,
    };
    res.json(snapshot);
});
