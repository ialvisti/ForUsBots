// docs/datos/js/components/metrics.js
const MetricsUI = (() => {
  const root = document.getElementById("metrics-root");
  let currentAbort = null;

  let currentChart = "avg"; // 'avg' | 'hist' | 'thru' | 'status'
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate()
  )}`;
  const monthStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const yearStr = String(now.getFullYear());

  let thruMode = "hour";
  let thruDate = todayStr;
  let thruMonth = monthStr;
  let thruYear = yearStr;

  let snapshot = {
    totals: {},
    byBot: {},
    durations: [],
    throughput: [],
    status: { succeeded: 0, failed: 0 },
  };

  function abortInFlight() {
    try {
      if (currentAbort) currentAbort.abort();
    } catch {}
    currentAbort = null;
  }

  function kpi(title, value, hint) {
    const el = document.createElement("div");
    el.className = "panel";
    el.innerHTML = `
      <h3>${title}</h3>
      <div class="kpi">${value}</div>
      ${hint ? `<div class="muted">${hint}</div>` : ""}
    `;
    return el;
  }

  function fmtDurationSecs(total) {
    const s = Math.max(0, Number(total) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function mainChartPanel(title, subtitle) {
    const el = document.createElement("div");
    el.className = "panel full mainchart";
    el.innerHTML = `<h3>${title}</h3>${
      subtitle ? `<div class="muted">${subtitle}</div>` : ""
    }<canvas class="chart"></canvas>`;
    return el;
  }

  function drawAvgByBot(panelEl, byBot) {
    const cvs = panelEl.querySelector("canvas");
    const items = Object.entries(byBot).map(([bot, v]) => ({
      label: bot,
      value: v.avgDurationSeconds ?? 0,
    }));
    Chart.barChart(cvs, items, {
      height: 420,
      yMin: 0,
      yMax: 13,
      yStep: 0.5,
      yLabelEvery: 1.5,
      paddingLeft: 52,
    });
  }

  function drawHistogram(panelEl, durations) {
    const cvs = panelEl.querySelector("canvas");
    Chart.histogram(cvs, durations, {
      height: 420,
      bins: 12,
      overlayLine: true,
    });
  }

  function drawThroughput(panelEl, series) {
    const cvs = panelEl.querySelector("canvas");
    const data = (series || [])
      .sort((a, b) => a.tsHour - b.tsHour)
      .map((p) => ({ x: p.tsHour, y: p.count }));

    let timeFormatter = null;
    if (thruMode === "hour") {
      timeFormatter = (x) =>
        new Date(x).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
    } else if (thruMode === "day") {
      timeFormatter = (x) =>
        new Date(x).toLocaleDateString([], { day: "2-digit", month: "short" });
    } else {
      timeFormatter = (x) =>
        new Date(x).toLocaleDateString([], { month: "short", year: "numeric" });
    }

    Chart.lineChart(cvs, [{ name: "Jobs", data }], {
      time: true,
      includeZero: true,
      height: 420,
      timeFormatter,
    });
  }

  function drawStatus(panelEl, status) {
    const cvs = panelEl.querySelector("canvas");
    Chart.barChart(
      cvs,
      [
        { label: "succeeded", value: status.succeeded },
        { label: "failed", value: status.failed },
      ],
      { height: 420 }
    );
  }

  function controls() {
    const wrap = document.createElement("div");
    wrap.className = "panel full-row";
    wrap.innerHTML = `
      <div class="row" style="gap:12px; align-items:center;">
        <label style="min-width:220px">Gráfica
          <select id="chart-type">
            <option value="avg">Avg Duration per Bot</option>
            <option value="hist">Distribución de Duraciones</option>
            <option value="thru">Throughput</option>
            <option value="status">Success vs fail</option>
          </select>
        </label>
        <span id="thru-controls" class="row" style="gap:10px; align-items:center;"></span>
        <button id="m-refresh" class="secondary xtra-space">Refresh</button>
      </div>
    `;

    // tipo de gráfica
    const sel = wrap.querySelector("#chart-type");
    sel.value = currentChart;
    sel.addEventListener("change", () => {
      currentChart = sel.value;
      renderUI();
    });

    // controles de throughput
    const thruHost = wrap.querySelector("#thru-controls");
    if (currentChart === "thru") {
      const thruHTML = `
        <label>Vista
          <select id="thru-mode">
            <option value="hour">Day (hours)</option>
            <option value="day">Month (days)</option>
            <option value="month">Year (months)</option>
          </select>
        </label>
        <label id="ctrl-date" style="min-width:180px;">
          Day
          <input id="thru-date" type="date" value="${thruDate}" />
        </label>
        <label id="ctrl-month" style="min-width:160px; display:none;">
          Month
          <input id="thru-month" type="month" value="${thruMonth}" />
        </label>
        <label id="ctrl-year" style="min-width:120px; display:none;">
          Year
          <input id="thru-year" type="number" min="2000" max="9999" value="${thruYear}" />
        </label>
      `;
      thruHost.innerHTML = thruHTML;

      const modeSel = thruHost.querySelector("#thru-mode");
      const elDate = thruHost.querySelector("#thru-date");
      const elMonth = thruHost.querySelector("#thru-month");
      const elYear = thruHost.querySelector("#thru-year");
      const ctrlDate = thruHost.querySelector("#ctrl-date");
      const ctrlMonth = thruHost.querySelector("#ctrl-month");
      const ctrlYear = thruHost.querySelector("#ctrl-year");

      modeSel.value = thruMode;

      function updateVisibility() {
        ctrlDate.style.display = thruMode === "hour" ? "" : "none";
        ctrlMonth.style.display = thruMode === "day" ? "" : "none";
        ctrlYear.style.display = thruMode === "month" ? "" : "none";
      }
      updateVisibility();

      modeSel.addEventListener("change", async () => {
        thruMode = modeSel.value;
        updateVisibility();
        await loadSnapshotFromDB();
      });
      elDate.addEventListener("change", async () => {
        thruDate = elDate.value || todayStr;
        await loadSnapshotFromDB();
      });
      elMonth.addEventListener("change", async () => {
        thruMonth = elMonth.value || monthStr;
        await loadSnapshotFromDB();
      });
      elYear.addEventListener("change", async () => {
        const v = parseInt(elYear.value || yearStr, 10);
        thruYear = Number.isFinite(v) ? String(v) : yearStr;
        await loadSnapshotFromDB();
      });
    } else {
      thruHost.innerHTML = "";
    }

    wrap.querySelector("#m-refresh").addEventListener("click", () => {
      loadSnapshotFromDB();
    });

    return wrap;
  }

  function renderUI() {
    root.innerHTML = "";

    const kpisWrap = document.createElement("div");
    kpisWrap.className = "kpis grid full-row";
    const t = snapshot.totals || {};
    const topLabel = t.topJob?.botId || "—";
    const topHint = t.topJob ? `${t.topJob.count} runs` : "";
    kpisWrap.append(
      kpi("Time spent", fmtDurationSecs(t.timeSpentSeconds || 0)),
      kpi("Jobs", t.jobsTotal ?? 0),
      kpi("Top Job", topLabel, topHint),
      kpi("Max Concurrency", t.maxConcurrency ?? "—")
    );
    root.append(kpisWrap);

    root.append(controls());

    let title = "";
    let subtitle = "From BD (snapshot)";
    if (currentChart === "avg") title = "Avg Duration por Bot (s)";
    else if (currentChart === "hist") title = "Distribución de Duraciones (s)";
    else if (currentChart === "thru") title = "Throughput";
    else title = "Estado: succeeded vs failed";

    const main = mainChartPanel(title, subtitle);
    root.append(main);

    if (currentChart === "avg") drawAvgByBot(main, snapshot.byBot);
    else if (currentChart === "hist") drawHistogram(main, snapshot.durations);
    else if (currentChart === "thru") drawThroughput(main, snapshot.throughput);
    else drawStatus(main, snapshot.status);

    window.addEventListener(
      "resize",
      () => {
        renderUI();
      },
      { passive: true, once: true }
    );
  }

  async function loadSnapshotFromDB() {
    abortInFlight();
    const ctrl = new AbortController();
    currentAbort = ctrl;
    try {
      const thruParams = { top: 400, hours: 48, days: 14 };
      if (currentChart === "thru") {
        if (thruMode === "hour") {
          thruParams.agg = "hour";
          thruParams.date = thruDate;
        } else if (thruMode === "day") {
          thruParams.agg = "day";
          thruParams.month = thruMonth;
        } else {
          thruParams.agg = "month";
          thruParams.year = thruYear;
        }
      }
      const mdb = await DataAPI.metricsDB(thruParams, { signal: ctrl.signal });

      snapshot = {
        totals: mdb.totals || {},
        byBot: mdb.byBot || {},
        durations: Array.isArray(mdb.durations) ? mdb.durations : [],
        throughput: Array.isArray(mdb.throughput) ? mdb.throughput : [],
        status: mdb.status || { succeeded: 0, failed: 0 },
      };

      renderUI();
    } catch (e) {
      if (e?.name === "AbortError") return;
      root.innerHTML = `<div class="panel error">Unable to load metrics (BD): ${
        e?.message || e
      }</div>`;
    } finally {
      currentAbort = null;
    }
  }

  function start() {
    const now2 = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    currentChart = "avg";
    thruMode = "hour";
    thruDate = `${now2.getFullYear()}-${pad(now2.getMonth() + 1)}-${pad(
      now2.getDate()
    )}`;
    thruMonth = `${now2.getFullYear()}-${pad(now2.getMonth() + 1)}`;
    thruYear = String(now2.getFullYear());
    loadSnapshotFromDB();
  }

  function stop() {
    abortInFlight();
  }

  return { start, stop };
})();
