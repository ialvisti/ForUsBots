// docs/sandbox/js/endpoints/jobs.js
export async function fetchJob(base, jobId, tokenValue) {
  const headers = tokenValue ? { "x-auth-token": tokenValue } : {};
  const r = await fetch(base + "/forusbot/jobs/" + jobId, { headers });
  return r.json();
}

const TERMINAL_STATES = new Set([
  "SUCCEEDED",
  "SUCCESS",
  "COMPLETED",
  "DONE",
  "FAILED",
  "ERROR",
  "CANCELED",
  "CANCELLED",
]);

export function startPolling({
  base,
  jobId,
  tokenValue,
  renderState,
  cancelBtn,
  intervalMs = 2500,
}) {
  let interval = null;

  const cancel = () => {
    if (interval) clearInterval(interval);
    cancelBtn.disabled = true;
    interval = null;
  };

  const poll = async () => {
    try {
      const j = await fetchJob(base, jobId, tokenValue);
      renderState(j);
      const s = String(j.state ?? j.status ?? "")
        .toUpperCase()
        .trim();
      if (TERMINAL_STATES.has(s)) cancel();
    } catch {}
  };

  cancelBtn.disabled = false;
  poll();
  interval = setInterval(poll, intervalMs);
  return cancel;
}
