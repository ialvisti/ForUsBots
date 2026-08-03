// docs/sandbox/js/endpoints/jobs.js
export async function fetchJob(base, jobId, tokenValue) {
  const headers = tokenValue ? { "x-auth-token": tokenValue } : {};
  const r = await fetch(`${base}/forusbot/jobs/${encodeURIComponent(jobId)}`, {
    headers,
  });
  let body = null;
  try {
    body = await r.json();
  } catch {}
  return { http: r.status, body };
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

function isTerminalState(s) {
  return TERMINAL_STATES.has(
    String(s || "")
      .toUpperCase()
      .trim()
  );
}

/**
 * Polling en memoria:
 *  - Se detiene sólo por estado terminal o cancelación explícita.
 *  - Respuestas 404 o errores de red transitorios no terminan el polling.
 *  - Devuelve una función canceladora: cancel(wipeUI:boolean=false).
 *    - Si llamas cancel(true) borra el snapshot (y puedes limpiar tu UI).
 */
export function startPolling({
  base,
  jobId,
  tokenValue,
  renderState,
  cancelBtn,
  intervalMs = 2500,
}) {
  let interval = null;
  let stopped = false;
  let lastSnapshot = null;

  const cancel = (wipeUI = false) => {
    if (interval) clearInterval(interval);
    stopped = true;
    interval = null;
    if (cancelBtn) cancelBtn.disabled = true;
    if (wipeUI) {
      lastSnapshot = null;
      try {
        renderState?.(null);
      } catch {}
    }
  };

  const poll = async () => {
    if (stopped) return;

    try {
      const { http, body } = await fetchJob(base, jobId, tokenValue);

      if (
        http === 404 ||
        (body && body.ok === false && /not\s*found/i.test(body.error || ""))
      ) {
        if (!lastSnapshot) {
          try {
            renderState?.({ ok: false, error: "Trabajo no encontrado" });
          } catch {}
        }
        if (!stopped) interval = setTimeout(poll, intervalMs);
        return;
      }

      if (body && typeof body === "object") {
        lastSnapshot = body;
        try {
          renderState?.(body);
        } catch {}

        const stateStr = String(body.state ?? body.status ?? "");
        if (isTerminalState(stateStr)) {
          cancel(false);
          return;
        }

      }
    } catch {
      if (!lastSnapshot) {
        try {
          renderState?.({
            ok: false,
            error: "Error de red al consultar el trabajo",
          });
        } catch {}
      }
    }

    if (!stopped) {
      interval = setTimeout(poll, intervalMs);
    }
  };

  if (cancelBtn) cancelBtn.disabled = false;
  poll();
  return cancel;
}
