// docs/sandbox/js/core/search-ui.js
// Cableado de la UI y construcción del cuerpo para POST /forusbot/search-participants

function $(sel) {
  return document.querySelector(sel);
}

function orNull(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function getEls() {
  return {
    spCompany: $("#spCompany"),
    spFullName: $("#spFullName"),
    spEmail: $("#spEmail"),
    spSsn: $("#spSsn"),
    spPhone: $("#spPhone"),
    spParticipantId: $("#spParticipantId"),
    spFetchAllPages: $("#spFetchAllPages"),
    spPageLimit: $("#spPageLimit"),
    spMaxRows: $("#spMaxRows"),
    spTimeoutMs: $("#spTimeoutMs"),
  };
}

export function wireSearchUI({ onChange } = {}) {
  const {
    spCompany,
    spFullName,
    spEmail,
    spSsn,
    spPhone,
    spParticipantId,
    spFetchAllPages,
    spPageLimit,
    spMaxRows,
    spTimeoutMs,
  } = getEls();

  const PAGE_SIZE = 25;

  // Ajuste automático: si fetchAllPages está activo, garantizamos
  // al menos PAGE_SIZE * pageLimit filas para cubrir esas páginas.
  const maybeAutoscale = () => {
    const fetchAll = !!(spFetchAllPages && spFetchAllPages.checked);
    const pageLimit =
      parseInt(spPageLimit?.value || "1", 10) > 0
        ? parseInt(spPageLimit.value, 10)
        : 1;

    if (!fetchAll) return;

    const desired = PAGE_SIZE * pageLimit;
    const current =
      parseInt(spMaxRows?.value || String(PAGE_SIZE), 10) || PAGE_SIZE;

    if (current < desired && spMaxRows) {
      spMaxRows.value = String(desired);
    }
  };

  const inputs = [
    spCompany,
    spFullName,
    spEmail,
    spSsn,
    spPhone,
    spParticipantId,
    spPageLimit,
    spMaxRows,
    spTimeoutMs,
  ];

  inputs.forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      maybeAutoscale();
      onChange?.();
    });
  });

  if (spFetchAllPages) {
    spFetchAllPages.addEventListener("change", () => {
      maybeAutoscale();
      onChange?.();
    });
  }
}

export function buildSearchBodyStr(pretty = false) {
  const {
    spCompany,
    spFullName,
    spEmail,
    spSsn,
    spPhone,
    spParticipantId,
    spFetchAllPages,
    spPageLimit,
    spMaxRows,
    spTimeoutMs,
  } = getEls();

  const PAGE_SIZE = 25;

  const options = {
    fetchAllPages: !!(spFetchAllPages && spFetchAllPages.checked),
    pageLimit: parseInt(spPageLimit?.value || "1", 10) || 1,
    maxRows: parseInt(spMaxRows?.value || String(PAGE_SIZE), 10) || PAGE_SIZE,
    evidenceOnSuccess: false,
    timeoutMs: parseInt(spTimeoutMs?.value || "12000", 10) || 12000,
  };

  // Reflejar el mismo ajuste en los datos que enviamos
  if (options.fetchAllPages) {
    const minNeeded = PAGE_SIZE * Math.max(1, options.pageLimit);
    if (options.maxRows < minNeeded) {
      options.maxRows = minNeeded;
      if (spMaxRows) spMaxRows.value = String(minNeeded); // sincroniza UI
    }
  }

  const criteria = {
    companyName: orNull(spCompany?.value),
    fullName: orNull(spFullName?.value),
    email: orNull(spEmail?.value),
    ssn: orNull(spSsn?.value),
    phone: orNull(spPhone?.value),
    participantId: orNull(spParticipantId?.value),
  };

  const body = { criteria, options };
  return pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
}
