// src/middleware/request-log.js
// HTTP access log middleware: assigns req.id, logs request/response,
// and runs the rest of the request chain inside runWith({correlationId}).
const crypto = require("crypto");
const logger = require("../engine/logger");
const { runWith } = require("../engine/log-context");

function genId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "r-" + Math.random().toString(36).slice(2, 10);
  }
}

module.exports = function requestLog(req, res, next) {
  req.id = req.id || genId();
  const correlationId = req.id;
  const start = Date.now();

  runWith({ correlationId }, () => {
    logger.info({
      type: "http.request",
      method: req.method,
      path: req.originalUrl || req.url,
      correlationId,
    });

    res.on("finish", () => {
      const durMs = Date.now() - start;
      const lvl = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[lvl]({
        type: "http.response",
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durMs,
        correlationId,
      });
    });

    next();
  });
};
