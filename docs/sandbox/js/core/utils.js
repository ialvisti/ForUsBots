// docs/sandbox/js/core/utils.js
export const $ = (sel) => document.querySelector(sel);

export function showToast(toastEl, msg = "Copied ✅") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1200);
}

export function maskSecret(s) {
  if (!s) return "(empty)";
  const len = s.length;
  const dots = "•".repeat(Math.min(len, 24));
  return len > 24 ? dots + "…" : dots;
}

export function prettyResult(outEl, status, text) {
  if (!outEl) return;
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  outEl.textContent = `HTTP ${status}\n` + body;
}

export function lockBaseUrlToOrigin(baseUrlInput) {
  try {
    baseUrlInput.value = window.location.origin;
    baseUrlInput.readOnly = true;
    baseUrlInput.setAttribute("aria-readonly", "true");
    baseUrlInput.title = "Locked to this page’s origin";
  } catch {}
}
