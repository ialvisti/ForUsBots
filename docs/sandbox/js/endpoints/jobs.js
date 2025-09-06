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

const DONE_STAGE_RE = /^(done|finish|finished|final|finalize|completed)$/i;

function isTerminalState(s) {
  return TERMINAL_STATES.has(
    String(s || "")
      .toUpperCase()
      .trim()
  );
}

/**
 * Polling en memoria:
 *  - Se detiene en terminal o si el stage coincide con "done/finish/...".
 *  - Si luego llega 404/Job not found, conserva el último snapshot visto.
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

      // 404 / not found -> si ya teníamos snapshot, conservarlo y detener.
      if (
        http === 404 ||
        (body && body.ok === false && /not\s*found/i.test(body.error || ""))
      ) {
        if (lastSnapshot) {
          // Mantenemos lo último (posiblemente ya estaba en "done" stage)
          cancel(false);
          try {
            renderState?.(lastSnapshot);
          } catch {}
          return;
        } else {
          cancel(false);
          try {
            renderState?.({ ok: false, error: "Job not found" });
          } catch {}
          return;
        }
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

        // Señal temprana: algunos flows marcan stage "done" justo antes de finalizar.
        const stageName = String(body.stage ?? body.stageName ?? "").trim();
        if (stageName && DONE_STAGE_RE.test(stageName)) {
          cancel(false);
          return;
        }
      }
    } catch {
      // Error de red: si nunca vimos snapshot, corta y muestra error simple.
      if (!lastSnapshot) {
        cancel(false);
        try {
          renderState?.({
            ok: false,
            error: "Network error while polling job",
          });
        } catch {}
        return;
      }
      // Si ya había snapshot, lo conservamos y seguimos al próximo tick.
    }

    if (!stopped) {
      interval = setTimeout(poll, intervalMs);
    }
  };

  if (cancelBtn) cancelBtn.disabled = false;
  poll();

  // Mantener compat: devolvemos la función canceladora.
  // Para borrar snapshot anterior cuando arranques otro job, llama a cancel(true) antes.
  return cancel;
}
