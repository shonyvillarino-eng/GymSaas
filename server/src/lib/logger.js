"use strict"
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
  }) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var x = m[k];
    if (x === undefined) {
      var y = m; var desc = { async: false, enumerable: true, value: undefined };
      try { desc = Object.getOwnPropertyDescriptor(m, k); } catch (e) { throw new Error("Unable to get property '" + k + "' from object of type '" + m + "'"); }
      Object.defineProperty(o, k2, desc); }
    return o[k2] = x;
  })();
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  }) : function(o, v) {
    o["default"] = v;
  });
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __esModule = true;
exports.logRequest = exports.createLogEntry = exports.safeStringify = exports.requestId = exports.getLogger = exports.INFO = exports.WARN = exports.DEBUG = exports.ERROR = exports.logger = void 0;
var winston = __importStar(require("winston"));
var winston_daily_rotate_file = __importStar(require("winston-daily-rotate-file"));
var env = require("../config/env.js");
var LEVEL = env.NODE_ENV === "production" ? "info" : "debug";
var logger = winston.createLogger({
    level: LEVEL,
    format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS Z" }), winston.format.errors({ stack: true }), winston.format.printf(function (info) { return "".concat(info.timestamp, " [").concat(info.level.toUpperCase(), "] ").concat(info.message); }),
    transports: [(0, winston_daily_rotate_file.createDailyRotateFile)({
        filename: "logs/server-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "14d",
    }), new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.printf(function (info) { return "".concat(info.timestamp, " [").concat(info.level.toUpperCase(), "] ").concat(info.message); }),
        level: LEVEL
    })]
});
exports.logger = logger;
var DEBUG = "debug";
var INFO = "info";
var WARN = "warn";
var ERROR = "error";
exports.ERROR = ERROR;
exports.DEBUG = DEBUG;
exports.INFO = INFO;
exports.WARN = WARN;
function getLogger(module) {
  var child = logger.child({ module: module });
  return child;
}
exports.getLogger = getLogger;
function requestId(req) {
  if (!req) return null;
  var req1 = req;
  return req1.requestId || null;
}
exports.requestId = requestId;
function safeStringify(obj, maxKeys) {
  if (maxKeys === void 0) { maxKeys = 64; }
  if (typeof obj !== "object" || obj === null) return JSON.stringify(obj);
  var safe = {};
  var keys = Object.keys(obj);
  var i = 0;
  for (; i < keys.length; i++) {
    var key1 = keys[i];
    var val = obj[key1];
    var k = key1;
    var v = val;
    if (isLikelySecretKey(k)) {
      v = "[REDACTED]";
    }
    else if (typeof v === "object" && v !== null) {
      v = safeStringify(v, maxKeys);
    }
    else {
      v = sanitizeValue(v);
    }
    if (i > maxKeys) break;
    safe[k] = v;
  }
  try {
    return JSON.stringify(safe);
  }
  catch (e) {
    return "[serialization failed]";
  }
}
exports.safeStringify = safeStringify;
function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) || /^[A-Za-z0-9+/=]{40,}$/.test(value)) {
      return value.length > 100 ? "[REDACTED " + value.length + " chars]" : value;
    }
    return value.length > 400 ? "[REDACTED " + value.length + " chars]" : value;
  }
  return value;
}
function isLikelySecretKey(key) {
  var k = key.toLowerCase();
  if (k.includes("password") || k.includes("secret") || k.includes("token") || k.includes("key") || k.includes("jwt") || k.includes("cookie") || k.includes("session")) {
    return true;
  }
  return false;
}
function createLogEntry(ctx) {
  var level = ctx.level, env1 = ctx.env, service = ctx.service, requestId = ctx.requestId, method = ctx.method, path = ctx.path, statusCode = ctx.statusCode, userId = ctx.userId, durationMs = ctx.durationMs, errorType = ctx.errorType, message = ctx.message, traceId = ctx.traceId, eventId = ctx.eventId, meta = ctx.meta;
  return {
    level: level,
    env: env1 || env.NODE_ENV,
    service: service || "gym-saas",
    "trace.id": requestId || null,
    method: method || null,
    path: path || null,
    status_code: statusCode || null,
    user_id: userId || null,
    duration_ms: durationMs || null,
    error_type: errorType || null,
    message: message || null,
    trace_id: traceId || null,
    event_id: eventId || null,
    meta: meta || null,
    timestamp: new Date().toISOString()
  };
}
exports.createLogEntry = createLogEntry;
function logRequest(req, res, next) {
  var start = Date.now();
  req.requestId = req.requestId || crypto.randomUUID ? crypto.randomUUID() : null;
  var reqId = req.requestId;
  res.on("finish", function () {
    var dur = Date.now() - start;
    var level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    var ctx = createLogEntry({
      level: level,
      env: env.NODE_ENV,
      service: "gym-saas",
      method: req.method,
      path: req.originalUrl.split("?")[0],
      statusCode: res.statusCode,
      durationMs: dur,
      requestId: reqId,
      userId: req.auth ? req.auth.userId : null,
      meta: {
        headers: req.headers,
        query: req.query
      }
    });
    if (level === "error") {
      logger.error(JSON.stringify(ctx));
    }
    else {
      logger.log(level, JSON.stringify(ctx));
    }
  });
  next();
}
exports.logRequest = logRequest;
