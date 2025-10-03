// Js/builderBlocks.js
// Editor de bloques para dropdown details

/* ------------------------------------------------------
   Guard: evitar doble wiring del Detail Tab
------------------------------------------------------ */
let __detailWired = false;

/* ------------------------------------------------------
   Blocks hydration y management
------------------------------------------------------ */
function hydrateBlocksFromDetails(article) {
  (article.dropdownGroups || []).forEach((g) => {
    (g.items || []).forEach((it) => {
      if (!it.__blocks)
        it.__blocks = deserializeDetailToBlocks(it.detail || "");
    });
  });
}

function getOrInitBlocks(item) {
  if (!item.__blocks)
    item.__blocks = deserializeDetailToBlocks(item.detail || "");
  return item.__blocks;
}

function deserializeDetailToBlocks(detail) {
  // Edición no destructiva: si trae HTML arbitrario, lo cargamos como RAW.
  const html = String(detail || "").trim();
  if (!html) return [];
  return [{ type: "raw", html }];
}

/* ------------------------------------------------------
   Detail Tab wiring
------------------------------------------------------ */
function wireDetailTab() {
  if (__detailWired) return;
  __detailWired = true;

  const sel = document.getElementById("selActiveDropdown");
  if (sel) {
    sel.addEventListener("change", (e) => {
      const [gi, ii] = (e.target.value || "")
        .split(":")
        .map((n) => parseInt(n, 10));
      if (!isNaN(gi) && !isNaN(ii)) {
        window.BuilderState.setActiveDropdown(gi, ii);
        renderBlocksEditor();
        window.BuilderUI.syncDetailToolbarVisibility();
      }
    });
  }

  const toolbar = document.getElementById("blockToolbar");
  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const type = btn.getAttribute("data-block");
      if (!type) return;
      addBlockToActiveDropdown(type);
    });
  }
}

/* ------------------------------------------------------
   Mini toolbar (B/I/U + link a dropdown)
------------------------------------------------------ */
function createMiniToolbar({
  onBold,
  onItalic,
  onUnderline,
  linkInserterFactory,
}) {
  const bar = document.createElement("div");
  bar.className = "mini-toolbar";
  const btnB = document.createElement("button");
  btnB.type = "button";
  btnB.title = "Bold";
  btnB.innerHTML = "<b>B</b>";
  btnB.addEventListener("click", onBold);

  const btnI = document.createElement("button");
  btnI.type = "button";
  btnI.title = "Italic";
  btnI.innerHTML = "<i>I</i>";
  btnI.addEventListener("click", onItalic);

  const btnU = document.createElement("button");
  btnU.type = "button";
  btnU.title = "Underline";
  btnU.innerHTML = "<u>U</u>";
  btnU.addEventListener("click", onUnderline);

  const linkWrap = document.createElement("span");
  linkWrap.className = "mini-linkwrap";
  linkInserterFactory && linkInserterFactory(linkWrap);

  bar.append(btnB, btnI, btnU, linkWrap);
  return bar;
}

function applyMarkupToSelection(el, left, right) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const v = el.value || "";
  const sel = v.slice(start, end) || "";
  const before = v.slice(0, start);
  const after = v.slice(end);
  const replacement = `${left}${sel || ""}${right}`;
  el.value = before + replacement + after;
  const pos = before.length + replacement.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

/* ------------------------------------------------------
   Selector de dropdowns para insertar link
------------------------------------------------------ */
function buildDropdownLinkPicker(container, onInsert) {
  const art = window.BuilderState.builderState || {};
  const groups = Array.isArray(art.dropdownGroups) ? art.dropdownGroups : [];
  const all = [];
  groups.forEach((g, gi) =>
    (g.items || []).forEach((it, ii) => {
      if (it && (it.id || it.title)) {
        all.push({
          id: it.id || `${gi}:${ii}`,
          title: it.title || `(untitled ${gi + 1}-${ii + 1})`,
          group: g.topic || "(group)",
        });
      }
    })
  );

  const sel = document.createElement("select");
  sel.title = "Link to dropdown";
  sel.innerHTML =
    `<option value="">↗ Link to dropdown…</option>` +
    all
      .map(
        (o) =>
          `<option value="${o.id}">${window.BuilderUtils.escapeAttr(
            `${o.group} — ${o.title}`
          )}</option>`
      )
      .join("");

  const underline = document.createElement("label");
  underline.className = "mini-ucheck";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  const txt = document.createElement("span");
  txt.textContent = "Underline";
  underline.append(cb, txt);

  const add = document.createElement("button");
  add.type = "button";
  add.title = "Insert link";
  add.textContent = "Link";

  add.addEventListener("click", () => {
    const id = sel.value;
    if (!id) return;
    const found = all.find((x) => x.id === id);
    const href = window.BuilderUtils.makeArticleLinkHref(art.id, id);
    let html = `<a href="${href}">${window.BuilderUtils.escapeHtml(
      found ? found.title : id
    )}</a>`;
    if (cb.checked) html = `<u>${html}</u>`;
    onInsert(html);
    sel.value = "";
  });

  container.append(sel, add, underline);
}

/* ------------------------------------------------------
   Blocks Editor Rendering
------------------------------------------------------ */
function renderBlocksEditor() {
  const item = window.BuilderState.currentItem();
  const root = document.getElementById("blocksList");
  root.innerHTML = "";
  if (!item) return;

  const blocks = getOrInitBlocks(item);
  blocks.forEach((blk, idx) => {
    const card = document.createElement("div");
    card.className = "block-card";

    const head = document.createElement("div");
    head.className = "block-head";
    const title = document.createElement("strong");
    title.textContent = `Block ${idx + 1} — ${blk.type}`;
    const actions = document.createElement("div");
    actions.className = "block-actions";
    actions.innerHTML = `
      <button title="Up">▲</button>
      <button title="Down">▼</button>
      <button title="Duplicate">⧉</button>
      <button title="Delete">🗑</button>
    `;
    const [btnUp, btnDown, btnDup, btnDel] = actions.querySelectorAll("button");

    btnUp.addEventListener("click", () => {
      if (idx > 0) {
        const [b] = blocks.splice(idx, 1);
        blocks.splice(idx - 1, 0, b);
        persistBlocks(item, blocks, {
          updateDetail: true,
          rerenderEditor: true,
        });
      }
    });
    btnDown.addEventListener("click", () => {
      if (idx < blocks.length - 1) {
        const [b] = blocks.splice(idx, 1);
        blocks.splice(idx + 1, 0, b);
        persistBlocks(item, blocks, {
          updateDetail: true,
          rerenderEditor: true,
        });
      }
    });
    btnDup.addEventListener("click", () => {
      blocks.splice(idx + 1, 0, JSON.parse(JSON.stringify(blk)));
      persistBlocks(item, blocks, { updateDetail: true, rerenderEditor: true });
    });
    btnDel.addEventListener("click", () => {
      if (confirm("Delete this block?")) {
        blocks.splice(idx, 1);
        persistBlocks(item, blocks, {
          updateDetail: true,
          rerenderEditor: true,
        });
      }
    });
    head.append(title, actions);

    const body = document.createElement("div");

    // Render specific block type editor
    if (blk.type === "paragraph") {
      renderParagraphEditor(body, blk, item, blocks);
    } else if (blk.type === "raw") {
      renderRawEditor(body, blk, item, blocks);
    } else if (blk.type === "tip") {
      renderTipEditor(body, blk, item, blocks);
    } else if (blk.type === "table") {
      renderTableEditor(body, blk, item, blocks);
    } else if (blk.type === "tabs") {
      renderTabsEditor(body, blk, item, blocks);
    } else if (blk.type === "flowchart") {
      renderFlowchartEditor(body, blk, item, blocks);
    }

    card.append(head, body);
    root.appendChild(card);
  });
}

/* ------------------------------------------------------
   Block Type Editors
------------------------------------------------------ */
function renderParagraphEditor(body, blk, item, blocks) {
  const ta = document.createElement("textarea");
  ta.rows = 4;
  ta.value = blk.text || "";

  const toolbar = createMiniToolbar({
    onBold: () => applyMarkupToSelection(ta, "**", "**"),
    onItalic: () => applyMarkupToSelection(ta, "*", "*"),
    onUnderline: () => applyMarkupToSelection(ta, "_", "_"),
    linkInserterFactory: (wrap) =>
      buildDropdownLinkPicker(wrap, (html) =>
        applyMarkupToSelection(ta, html, "")
      ),
  });

  ta.addEventListener("input", () => {
    blk.text = ta.value;
    persistBlocks(item, blocks, { updateDetail: true, rerenderEditor: false });
  });

  body.append(toolbar, ta);
}

function renderRawEditor(body, blk, item, blocks) {
  const warn = document.createElement("div");
  warn.className = "assist";
  warn.textContent =
    "Raw HTML will be injected as-is. Ensure it is safe and valid.";
  const ta = document.createElement("textarea");
  ta.rows = 6;
  ta.value = blk.html || "";
  ta.addEventListener("input", () => {
    blk.html = ta.value;
    persistBlocks(item, blocks, {
      updateDetail: true,
      rerenderEditor: false,
    });
  });
  body.append(warn, ta);
}

function renderTipEditor(body, blk, item, blocks) {
  const ta = document.createElement("textarea");
  ta.rows = 4;
  ta.value = blk.text || "";

  const toolbar = createMiniToolbar({
    onBold: () => applyMarkupToSelection(ta, "**", "**"),
    onItalic: () => applyMarkupToSelection(ta, "*", "*"),
    onUnderline: () => applyMarkupToSelection(ta, "_", "_"),
    linkInserterFactory: (wrap) =>
      buildDropdownLinkPicker(wrap, (html) =>
        applyMarkupToSelection(ta, html, "")
      ),
  });

  ta.addEventListener("input", () => {
    blk.text = ta.value;
    persistBlocks(item, blocks, {
      updateDetail: true,
      rerenderEditor: false,
    });
  });
  body.append(toolbar, ta);
}

function renderTableEditor(body, blk, item, blocks) {
  const rc = document.createElement("div");
  rc.className = "assist";
  rc.textContent = "Define rows and columns, then edit cells.";

  let focusedCell = null;

  const toolbar = createMiniToolbar({
    onBold: () => {
      if (focusedCell) applyMarkupToSelection(focusedCell, "**", "**");
    },
    onItalic: () => {
      if (focusedCell) applyMarkupToSelection(focusedCell, "*", "*");
    },
    onUnderline: () => {
      if (focusedCell) applyMarkupToSelection(focusedCell, "_", "_");
    },
    linkInserterFactory: (wrap) =>
      buildDropdownLinkPicker(wrap, (html) => {
        if (focusedCell) applyMarkupToSelection(focusedCell, html, "");
      }),
  });

  const controls = document.createElement("div");
  controls.className = "block-controls";
  controls.innerHTML = `
    <label>Rows <input type="number" min="1" value="${
      blk.rows || 2
    }" style="width:80px"></label>
    <label>Cols <input type="number" min="1" value="${
      blk.cols || 2
    }" style="width:80px"></label>
    <button>Apply</button>
  `;
  const [rowsInp, colsInp, applyBtn] =
    controls.querySelectorAll("input,button");
  const tbl = document.createElement("table");

  function buildCells() {
    const rows = Math.max(1, parseInt(rowsInp.value || "2", 10));
    const cols = Math.max(1, parseInt(colsInp.value || "2", 10));
    blk.rows = rows;
    blk.cols = cols;
    if (!Array.isArray(blk.data)) blk.data = [];
    for (let r = 0; r < rows; r++) {
      if (!blk.data[r]) blk.data[r] = [];
      for (let c = 0; c < cols; c++)
        if (typeof blk.data[r][c] !== "string") blk.data[r][c] = "";
    }
    tbl.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement(r === 0 ? "th" : "td");
        const inp = document.createElement("input");
        inp.value = blk.data[r][c] || "";
        inp.addEventListener("focus", () => (focusedCell = inp));
        inp.addEventListener("blur", () => (focusedCell = inp));
        inp.addEventListener("input", () => {
          blk.data[r][c] = inp.value;
          persistBlocks(item, blocks, {
            updateDetail: true,
            rerenderEditor: false,
          });
        });
        td.appendChild(inp);
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
  }

  applyBtn.addEventListener("click", () => {
    buildCells();
    persistBlocks(item, blocks, {
      updateDetail: true,
      rerenderEditor: true,
    });
  });
  rowsInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyBtn.click();
    }
  });
  colsInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyBtn.click();
    }
  });

  function buildCells() {
    const rows = Math.max(1, parseInt(rowsInp.value || "2", 10));
    const cols = Math.max(1, parseInt(colsInp.value || "2", 10));

    blk.rows = rows;
    blk.cols = cols;

    if (!Array.isArray(blk.data)) blk.data = [];

    // --- recortar/normalizar filas y columnas en blk.data ---
    // recorta filas sobrantes si se redujo el número
    if (blk.data.length > rows) {
      blk.data = blk.data.slice(0, rows);
    }
    // asegura cada fila y recorta/crea columnas al tamaño exacto
    for (let r = 0; r < rows; r++) {
      if (!Array.isArray(blk.data[r])) blk.data[r] = [];
      if (blk.data[r].length > cols) {
        blk.data[r] = blk.data[r].slice(0, cols);
      }
      for (let c = 0; c < cols; c++) {
        if (typeof blk.data[r][c] !== "string") blk.data[r][c] = "";
      }
    }

    // --- reconstruye la tabla del editor ---
    tbl.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement(r === 0 ? "th" : "td");
        const inp = document.createElement("input");
        inp.value = blk.data[r][c] || "";
        inp.addEventListener("focus", () => (focusedCell = inp));
        inp.addEventListener("blur", () => (focusedCell = inp));
        inp.addEventListener("input", () => {
          blk.data[r][c] = inp.value;
          persistBlocks(item, blocks, {
            updateDetail: true,
            rerenderEditor: false,
          });
        });
        td.appendChild(inp);
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
  }

  body.append(rc, toolbar, controls, tbl);
}

function renderTabsEditor(body, blk, item, blocks) {
  if (!Array.isArray(blk.tabs))
    blk.tabs = [
      { title: "Tab 1", content: "" },
      { title: "Tab 2", content: "" },
    ];

  const list = document.createElement("div");
  list.className = "tabs-editor";
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Tab";
  addBtn.addEventListener("click", () => {
    blk.tabs.push({ title: `Tab ${blk.tabs.length + 1}`, content: "" });
    persistBlocks(item, blocks, {
      updateDetail: true,
      rerenderEditor: true,
    });
  });

  blk.tabs.forEach((t, ti) => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.gap = "0.35rem";
    row.style.marginBottom = "0.25rem";
    const title = document.createElement("input");
    title.value = t.title;
    title.addEventListener("input", () => {
      t.title = title.value;
      persistBlocks(item, blocks, {
        updateDetail: true,
        rerenderEditor: false,
      });
    });
    const del = document.createElement("button");
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      blk.tabs.splice(ti, 1);
      persistBlocks(item, blocks, {
        updateDetail: true,
        rerenderEditor: true,
      });
    });

    const content = document.createElement("textarea");
    content.rows = 3;
    content.placeholder = "Tab HTML or text (markdown allowed)";
    content.value = t.content || "";

    const toolbar = createMiniToolbar({
      onBold: () => applyMarkupToSelection(content, "**", "**"),
      onItalic: () => applyMarkupToSelection(content, "*", "*"),
      onUnderline: () => applyMarkupToSelection(content, "_", "_"),
      linkInserterFactory: (wrap) =>
        buildDropdownLinkPicker(wrap, (html) =>
          applyMarkupToSelection(content, html, "")
        ),
    });

    content.addEventListener("input", () => {
      t.content = content.value;
      persistBlocks(item, blocks, {
        updateDetail: true,
        rerenderEditor: false,
      });
    });

    row.append(title, del);
    list.append(row, toolbar, content);
  });

  body.append(list, addBtn);
}

function renderFlowchartEditor(body, blk, item, blocks) {
  const input = document.createElement("input");
  input.placeholder = "Lucid embed URL or ID";
  input.value = blk.embed || "";
  input.addEventListener("input", () => {
    blk.embed = input.value;
    persistBlocks(item, blocks, {
      updateDetail: true,
      rerenderEditor: false,
    });
  });
  body.appendChild(input);
}

/* ------------------------------------------------------
   Block Operations
------------------------------------------------------ */
function persistBlocks(
  item,
  blocks,
  opts = { updateDetail: true, rerenderEditor: true }
) {
  const { updateDetail = true, rerenderEditor = true } = opts || {};
  if (updateDetail) item.detail = serializeBlocksToDetail(blocks);
  if (rerenderEditor) renderBlocksEditor(); // evitamos rerender en cada tecla para no perder foco
  window.BuilderPreview.triggerPreview();
}

function addBlockToActiveDropdown(blockType) {
  const item = window.BuilderState.currentItem();
  if (!item) return;
  if (item.type === "flowchart" && blockType !== "flowchart") return; // flowchart dropdown solo acepta embed
  const blocks = getOrInitBlocks(item);
  const newBlock = blockDefaults(blockType, item.type);
  if (!newBlock) return;
  blocks.push(newBlock);
  item.detail = serializeBlocksToDetail(blocks);
  renderBlocksEditor();
  window.BuilderPreview.triggerPreview();
}

function blockDefaults(type, itemType) {
  if (type === "paragraph") return { type: "paragraph", text: "" };
  if (type === "raw") return { type: "raw", html: "" };
  if (type === "tip") return { type: "tip", text: "" };
  if (type === "table")
    return {
      type: "table",
      rows: 2,
      cols: 2,
      data: [
        ["Header 1", "Header 2"],
        ["", ""],
      ],
    };
  if (type === "tabs")
    return {
      type: "tabs",
      tabs: [
        { title: "Tab 1", content: "" },
        { title: "Tab 2", content: "" },
      ],
    };
  if (type === "flowchart" && itemType === "flowchart")
    return { type: "flowchart", embed: "" };
  return null;
}

/* ------------------------------------------------------
   Block Serialization
------------------------------------------------------ */
function serializeBlocksToDetail(blocks) {
  return blocks.map((b) => serializeBlock(b)).join("\n");
}

function serializeBlock(b) {
  if (b.type === "paragraph") {
    // Soporta **bold**, *italic* y _underline_
    return `<p>${window.BuilderUtils.formatText(b.text || "")}</p>`;
  }
  if (b.type === "tip") {
    const inner = (b.text || "")
      .split(/\n+/)
      .map((t) => `<p>${window.BuilderUtils.formatText(t)}</p>`)
      .join("");
    return `<div class="tip-box">${inner}</div>`;
  }
  if (b.type === "raw") {
    return String(b.html || "");
  }
  if (b.type === "table") {
    const rows = Array.isArray(b.data) ? b.data : [];
    const thead = rows[0]
      ? `<thead><tr>${rows[0]
          .map((c) => `<th>${window.BuilderUtils.renderMaybeHtml(c)}</th>`)
          .join("")}</tr></thead>`
      : "";
    const bodyRows = rows
      .slice(1)
      .map(
        (r) =>
          `<tr>${r
            .map((c) => `<td>${window.BuilderUtils.renderMaybeHtml(c)}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<table>${thead}<tbody>${bodyRows}</tbody></table>`;
  }
  if (b.type === "tabs") {
    const tabs = Array.isArray(b.tabs) ? b.tabs : [];
    const nav = `<div class="tab-nav">${tabs
      .map(
        (t, i) =>
          `<button${
            i === 0 ? ' class="active"' : ""
          }>${window.BuilderUtils.escapeHtml(
            t.title || `Tab ${i + 1}`
          )}</button>`
      )
      .join("")}</div>`;
    const panels = tabs
      .map(
        (t, i) =>
          `<div class="tab-panel${
            i === 0 ? " active" : ""
          }">${window.BuilderUtils.renderMaybeHtml(t.content || "")}</div>`
      )
      .join("");
    return `<div class="tab-frame">${nav}${panels}</div>`;
  }
  if (b.type === "flowchart") {
    const id = window.BuilderUtils.extractLucidId(b.embed || "");
    if (!id) return "";
    return `
    <div style="width:100%; height:450px; margin:10px 0;">
      <iframe allowfullscreen frameborder="0" style="width:100%; height:100%;" src="https://lucid.app/documents/embedded/${id}"></iframe>
    </div>`;
  }
  return "";
}

// Export para uso en otros módulos
if (typeof window !== "undefined") {
  window.BuilderBlocks = {
    hydrateBlocksFromDetails,
    getOrInitBlocks,
    deserializeDetailToBlocks,
    wireDetailTab,
    renderBlocksEditor,
    persistBlocks,
    addBlockToActiveDropdown,
    blockDefaults,
    serializeBlocksToDetail,
    serializeBlock,
  };
}
