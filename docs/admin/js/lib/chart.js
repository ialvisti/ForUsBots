// docs/admin/js/lib/chart.js
// Utilidades ultra-livianas para <canvas>: lineChart, barChart, histogram.

const Chart = (() => {
  const palette = [
    "#4da3ff",
    "#2ecc71",
    "#f1c40f",
    "#e67e22",
    "#e74c3c",
    "#9b59b6",
  ];

  function dpi(canvas, logicalHeight = 220) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 600;
    const h = logicalHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  function niceStep(range, target = 6) {
    const rough = range / Math.max(1, target);
    const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1e-12, rough))));
    const r = rough / pow10;
    let step = pow10;
    if (r >= 5) step = 5 * pow10;
    else if (r >= 2) step = 2 * pow10;
    return step;
  }

  function mapX(x, xMin, xMax, w, padding) {
    const xs = (x - xMin) / Math.max(1e-9, xMax - xMin);
    return padding.left + xs * (w - padding.left - padding.right);
  }
  function mapY(y, yMin, yMax, h, padding) {
    const ys = (y - yMin) / Math.max(1e-9, yMax - yMin);
    return h - padding.bottom - ys * (h - padding.top - padding.bottom);
  }

  function drawAxes(
    ctx,
    w,
    h,
    padding,
    xMin,
    xMax,
    yMin,
    yMax,
    {
      xIsTime = false,
      showXLabels = true,
      timeFormatter = null,
      yStep: yStepOverride = null,
      yLabelEvery = 1, // dibuja etiqueta de Y cada N ticks (la grilla sigue completa)
    } = {}
  ) {
    ctx.strokeStyle = "#1f2a36";
    ctx.lineWidth = 1;

    // cuadro
    ctx.strokeRect(
      padding.left,
      padding.top,
      w - padding.left - padding.right,
      h - padding.top - padding.bottom
    );

    // grid + labels
    ctx.fillStyle = "#7d8b99";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    // Y grid (permite yStep fijo)
    const yRange = Math.max(1e-9, yMax - yMin);
    const yStep = yStepOverride || niceStep(yRange, 5);
    let tickIdx = 0;
    for (
      let y = Math.ceil(yMin / yStep) * yStep;
      y <= yMax + 1e-9;
      y += yStep, tickIdx++
    ) {
      const py = mapY(y, yMin, yMax, h, padding);
      ctx.strokeStyle = "rgba(125,139,153,0.2)";
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(w - padding.right, py);
      ctx.stroke();

      // etiqueta sólo cada N ticks (pero mantenemos la grilla completa)
      if (tickIdx % Math.max(1, yLabelEvery) === 0) {
        ctx.fillStyle = "#7d8b99";
        const label = Math.round(y * 100) / 100;
        ctx.fillText(String(label), 6, py - 2);
      }
    }

    // X grid
    const xRange = Math.max(1e-9, xMax - xMin);
    const xStep = niceStep(xRange, 6);
    for (
      let x = Math.ceil(xMin / xStep) * xStep;
      x <= xMax + 1e-9;
      x += xStep
    ) {
      const px = mapX(x, xMin, xMax, w, padding);
      ctx.strokeStyle = "rgba(125,139,153,0.2)";
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, h - padding.bottom);
      ctx.stroke();
      if (showXLabels) {
        let label = String(Math.round(x));
        if (xIsTime) {
          label =
            typeof timeFormatter === "function"
              ? String(timeFormatter(x))
              : new Date(x).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
        }
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "#7d8b99";
        ctx.fillText(
          label,
          Math.max(padding.left, Math.min(px - tw / 2, w - padding.right - tw)),
          h - 6
        );
      }
    }
  }

  // -------- LINE CHART --------
  function lineChart(canvas, series, opts = {}) {
    const { ctx, w, h } = dpi(canvas, opts.height || 260);
    const padding = {
      top: 14,
      right: 12,
      bottom: 24,
      left: opts.paddingLeft || 42,
    };
    const flat = series.flatMap((s) => s.data);
    if (!flat.length) {
      ctx.fillStyle = "#7d8b99";
      ctx.fillText("No data", 10, 20);
      return;
    }
    const xMin = Math.min(...flat.map((p) => p.x));
    const xMax = Math.max(...flat.map((p) => p.x));
    const yMin = Math.min(
      0,
      ...(opts.includeZero ? [0] : []),
      ...flat.map((p) => p.y)
    );
    const yMax = Math.max(
      ...flat.map((p) => p.y),
      opts.yMax != null ? opts.yMax : -Infinity,
      1
    );

    drawAxes(ctx, w, h, padding, xMin, xMax, yMin, yMax, {
      xIsTime: !!opts.time,
      showXLabels: true,
      timeFormatter: opts.timeFormatter || null,
      yStep: opts.yStep || null,
      yLabelEvery: opts.yLabelEvery || 1,
    });

    series.forEach((s, i) => {
      const color = s.color || palette[i % palette.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.data.forEach((p, idx) => {
        const px = mapX(p.x, xMin, xMax, w, padding);
        const py = mapY(p.y, yMin, yMax, h, padding);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(
        s.name || `Series ${i + 1}`,
        w - padding.right - 140,
        padding.top + 14 * (i + 1)
      );
    });
  }

  // -------- BAR CHART --------
  function barChart(canvas, items, opts = {}) {
    const { ctx, w, h } = dpi(canvas, opts.height || 260);
    const padding = {
      top: 14,
      right: 12,
      bottom: 40,
      left: opts.paddingLeft || 42,
    };
    if (!items.length) {
      ctx.fillStyle = "#7d8b99";
      ctx.fillText("No data", 10, 20);
      return;
    }
    const yMin = opts.yMin != null ? opts.yMin : 0;
    const yMax =
      opts.yMax != null ? opts.yMax : Math.max(...items.map((i) => i.value), 1);

    drawAxes(ctx, w, h, padding, 0, items.length, yMin, yMax, {
      showXLabels: false,
      yStep: opts.yStep || null,
      yLabelEvery: opts.yLabelEvery || 1,
    });

    const bw = (w - padding.left - padding.right) / Math.max(1, items.length);
    items.forEach((it, idx) => {
      const x0 = padding.left + idx * bw;
      const y0 = mapY(yMin, yMin, yMax, h, padding);
      const y1 = mapY(it.value, yMin, yMax, h, padding);
      const barH = y0 - y1;
      ctx.fillStyle = it.color || palette[idx % palette.length];
      ctx.fillRect(x0 + 4, y1, Math.max(2, bw - 8), barH);

      // etiqueta categoría
      ctx.fillStyle = "#7d8b99";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const lab = (it.label || "").toString();
      const tw = ctx.measureText(lab).width;
      const lx = Math.max(
        padding.left,
        Math.min(x0 + bw / 2 - tw / 2, w - padding.right - tw)
      );
      ctx.fillText(lab, lx, h - 8);
    });
  }

  // -------- HISTOGRAM --------
  function histogram(canvas, values, opts = {}) {
    const { ctx, w, h } = dpi(canvas, opts.height || 260);
    const padding = { top: 14, right: 12, bottom: 36, left: 42 };
    if (!values.length) {
      ctx.fillStyle = "#7d8b99";
      ctx.fillText("Sin datos", 10, 20);
      return;
    }
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    if (vMax <= vMin) {
      ctx.fillStyle = "#7d8b99";
      ctx.fillText("Rango insuficiente", 10, 20);
      return;
    }
    const range = vMax - vMin;
    const approxBins = opts.bins || 12;
    const step = niceStep(range, approxBins);
    const start = Math.floor(vMin / step) * step;
    const end = Math.ceil(vMax / step) * step;
    const bins = [];
    for (let x = start; x < end; x += step)
      bins.push({ from: x, to: x + step, count: 0 });

    values.forEach((v) => {
      const idx = Math.min(
        bins.length - 1,
        Math.max(0, Math.floor((v - start) / step))
      );
      bins[idx].count += 1;
    });

    const yMax = Math.max(1, ...bins.map((b) => b.count));
    drawAxes(ctx, w, h, padding, 0, bins.length, 0, yMax, {
      showXLabels: false,
    });

    const bw = (w - padding.left - padding.right) / Math.max(1, bins.length);
    bins.forEach((b, i) => {
      const x0 = padding.left + i * bw;
      const y0 = mapY(0, 0, yMax, h, padding);
      const y1 = mapY(b.count, 0, yMax, h, padding);
      const barH = y0 - y1;
      ctx.fillStyle = palette[0];
      ctx.fillRect(x0 + 2, y1, Math.max(2, bw - 4), barH);

      if (i % 2 === 0) {
        ctx.fillStyle = "#7d8b99";
        ctx.font =
          "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        const lab = `${Math.round(b.from)}–${Math.round(b.to)}`;
        const tw = ctx.measureText(lab).width;
        const lx = Math.max(
          padding.left,
          Math.min(x0 + bw / 2 - tw / 2, w - padding.right - tw)
        );
        ctx.fillText(lab, lx, h - 8);
      }
    });

    if (opts.overlayLine) {
      ctx.strokeStyle = palette[2];
      ctx.lineWidth = 2;
      ctx.beginPath();
      bins.forEach((b, i) => {
        const center = i + 0.5;
        const px = mapX(center, 0, bins.length, w, padding);
        const py = mapY(b.count, 0, yMax, h, padding);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }

  return { lineChart, barChart, histogram };
})();
