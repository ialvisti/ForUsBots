// src/engine/log-context.js
// AsyncLocalStorage-based context for log correlation.
// Propagates correlationId / jobId / botId through the async call chain
// so deep code can attach them without threading args.
const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

function runWith(ctx, fn) {
  const merged = { ...(als.getStore() || {}), ...(ctx || {}) };
  return als.run(merged, fn);
}

function getContext() {
  return als.getStore() || null;
}

function setContext(patch) {
  const store = als.getStore();
  if (store && patch) Object.assign(store, patch);
}

module.exports = { runWith, getContext, setContext };
