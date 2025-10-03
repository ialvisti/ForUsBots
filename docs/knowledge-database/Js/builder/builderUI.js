// Js/builderUI.js
// Interfaz de usuario: start panel, tabs, grupos y dropdowns + owners/experts + publish

/* ------------------------------------------------------
   Guard: evitar doble inicialización del start panel
------------------------------------------------------ */
let __startPanelInitialized = false;

/* ------------------------------------------------------
   Helpers de token por acción (para botones)
------------------------------------------------------ */
async function askTokenOrAbort(actionLabel, allowedRoles /* Set o null */) {
  const token = await window.BuilderUtils.promptTokenForAction(actionLabel);
  if (!token) return { token: null, ok: false, error: "cancelled" };
  const check = await window.BuilderUtils.requireRoleForAction(
    token,
    allowedRoles
  );
  if (!check.ok) {
    window.BuilderUtils.announce(
      document.getElementById("startMessages") ||
        document.getElementById("reviewMessages"),
      check.error
    );
    return { token: null, ok: false, error: check.error };
  }
  return { token, ok: true };
}

/* ------------------------------------------------------
   Start Panel
   - Un único login para acceder al builder
   - Con ese token (window.BuilderAccessToken) se cargan listas y pickers
------------------------------------------------------ */
function initStartPanel() {
  if (__startPanelInitialized) return;
  __startPanelInitialized = true;

  const sel = document.getElementById("savedDraftsSelect");
  const btnCreate = document.getElementById("btnCreateNew");
  const btnOpen = document.getElementById("btnOpenDraft");
  const selArt = document.getElementById("existingArticlesSelect");
  const btnClone = document.getElementById("btnCloneArticle");
  const msg = document.getElementById("startMessages");

  // 1) Pedir token de acceso una sola vez (cualquier rol) — "acceder al builder"
  (async () => {
    if (!window.BuilderAccessToken) {
      const token = await window.BuilderUtils.promptTokenForAction(
        "access the Article Builder"
      );
      if (!token) {
        window.BuilderUtils.announce(msg, "Access cancelled.");
        return;
      }
      // No validamos contra roles específicos: cualquier rol es válido para entrar
      const who = await window.BuilderAPI.whoAmI(token);
      if (!who || !who.ok || !who.role) {
        window.BuilderUtils.announce(msg, "Invalid or unauthorized token.");
        return;
      }
      window.BuilderAccessToken = token;
      window.BuilderUtils.announce(
        msg,
        `Welcome! Signed in as ${String(who.role || "user").toUpperCase()}.`
      );
    }

    // 2) Poblar combos con el token de acceso
    await refreshDraftsSelect(sel, window.BuilderAccessToken);
    await refreshArticlesSelect(selArt, window.BuilderAccessToken);
  })();

  // Crear nuevo
  btnCreate.addEventListener("click", () => {
    window.BuilderState.builderState = window.BuilderState.createNewDraft();
    openWorkspace();
  });

  // Abrir draft
  btnOpen.addEventListener("click", async () => {
    const id = sel.value;
    if (!id)
      return window.BuilderUtils.announce(msg, "Select a draft to open.");
    const accessToken = window.BuilderAccessToken || null;
    try {
      const { article } = await window.BuilderAPI.getDraft(id, accessToken);
      window.BuilderState.builderState =
        window.BuilderState.sanitizeDraft(article);
      window.BuilderBlocks.hydrateBlocksFromDetails(
        window.BuilderState.builderState
      );
      openWorkspace();
      window.BuilderUtils.announce(
        msg,
        `Draft "${article.title || article.id}" loaded.`
      );
    } catch (e) {
      window.BuilderUtils.announce(msg, "Draft not found or cannot be read.");
    }
  });

  // Clonar publicado
  btnClone.addEventListener("click", async () => {
    const id = selArt.value;
    if (!id)
      return window.BuilderUtils.announce(msg, "Select an article to clone.");
    const accessToken = window.BuilderAccessToken || null;
    try {
      const { article } = await window.BuilderAPI.getPublished(id, accessToken);
      window.BuilderState.builderState =
        window.BuilderState.cloneFromArticle(article);
      window.BuilderBlocks.hydrateBlocksFromDetails(
        window.BuilderState.builderState
      );
      openWorkspace();
      window.BuilderUtils.announce(
        msg,
        `Cloned "${article.title}" into draft "${window.BuilderState.builderState.id}".`
      );
    } catch {
      window.BuilderUtils.announce(msg, "Could not load published article.");
    }
  });

  // Import/Export en Start panel (piden token al clic)
  const importInput = document.getElementById("importFileInput");
  const btnImport = document.getElementById("btnImportDrafts");
  const btnExport = document.getElementById("btnExportDrafts");

  btnExport.addEventListener("click", async () => {
    const { ok } = await askTokenOrAbort("export drafts", null);
    if (!ok) return;
    window.BuilderState.exportDraftsFile();
  });

  btnImport.addEventListener("click", async () => {
    const { ok } = await askTokenOrAbort("import drafts", null);
    if (!ok) return;
    importInput.click();
  });
  importInput.addEventListener("change", async () => {
    if (importInput.files && importInput.files[0]) {
      const cnt = await window.BuilderState.importDraftsFromFile(
        importInput.files[0]
      );
      window.BuilderUtils.announce(
        document.getElementById("startMessages"),
        `Imported ${cnt} draft(s) (runtime).`
      );
      const accessToken = window.BuilderAccessToken || null;
      if (accessToken) {
        await refreshDraftsSelect(
          document.getElementById("savedDraftsSelect"),
          accessToken
        );
      }
      importInput.value = "";
    }
  });
}

async function refreshDraftsSelect(selectEl, token) {
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "— Select a saved draft —";
  selectEl.appendChild(ph);

  try {
    const { drafts = [] } = await window.BuilderAPI.listDrafts(token);
    const map = new Map();
    drafts.forEach((d) => {
      if (d && d.id && !map.has(d.id)) map.set(d.id, d);
    });
    Array.from(map.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = `${d.title || "(untitled)"} (${d.id})`;
        selectEl.appendChild(opt);
      });
  } catch (e) {
    window.BuilderUtils.announce(
      document.getElementById("startMessages"),
      "Failed to load drafts."
    );
  }
}

async function refreshArticlesSelect(selectEl, token) {
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "— Select existing article —";
  selectEl.appendChild(ph);

  try {
    const { articles = [] } = await window.BuilderAPI.listPublished(token);
    const map = new Map();
    articles.forEach((a) => {
      if (a && a.id && !map.has(a.id)) map.set(a.id, a);
    });
    Array.from(map.values()).forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent =
        `${a.title || "(untitled)"} (${a.id})` +
        (a.createdByName ? ` — by ${a.createdByName}` : "");
      selectEl.appendChild(opt);
    });
  } catch {
    /* silencio */
  }
}

/* ------------------------------------------------------
   Workspace
------------------------------------------------------ */
function openWorkspace() {
  document.getElementById("startPanel").style.display = "none";
  document.getElementById("builderWorkspace").style.display = "grid";

  document.getElementById("inpArticleId").value =
    window.BuilderState.builderState.id;
  document.getElementById("inpTitle").value =
    window.BuilderState.builderState.title;
  document.getElementById("inpDesc").value =
    window.BuilderState.builderState.desc;

  // People pickers (usan el token de acceso, no piden uno nuevo)
  initPeoplePickers();

  // Tabs y vistas
  renderGroupsList();
  rebuildActiveDropdownSelector();
  updateTabsLock();
  window.BuilderPreview.triggerPreview();
}

/* ------------------------------------------------------
   Tabs lock helpers (require Article ID)
------------------------------------------------------ */
function isArticleIdFilled() {
  return Boolean(window.BuilderState?.builderState?.id);
}
function updateTabsLock() {
  const btns = document.querySelectorAll(".tab-btn");
  const locked = !isArticleIdFilled();
  btns.forEach((b) => {
    const isBasics = b.dataset.tab === "basicsTab";
    if (!isBasics) {
      b.classList.toggle("locked", locked);
      b.setAttribute("aria-disabled", locked ? "true" : "false");
      b.tabIndex = locked ? -1 : 0;
    }
  });
}

/* ------------------------------------------------------
   Tabs Navigation
------------------------------------------------------ */
function initTabsUI() {
  const btns = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  updateTabsLock();

  btns.forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const targetId = btn.dataset.tab;
      const isBasics = targetId === "basicsTab";
      if (!isBasics && btn.classList.contains("locked")) {
        e.preventDefault();
        const help = document.getElementById("idHelp");
        if (help)
          help.textContent = "Article ID is required to access other tabs.";
        const idInput = document.getElementById("inpArticleId");
        if (idInput) idInput.focus();
        return;
      }
      btns.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(targetId).classList.add("active");
    })
  );
}

/* ------------------------------------------------------
   Basics Tab
------------------------------------------------------ */
function wireBasicsTab() {
  const idEl = document.getElementById("inpArticleId");
  const titleEl = document.getElementById("inpTitle");
  const descEl = document.getElementById("inpDesc");
  const idHelp = document.getElementById("idHelp");
  const idRegex = /^[a-z0-9_]+$/;

  idEl.addEventListener("input", () => {
    const raw = window.BuilderUtils.normalizeId(idEl.value);
    idEl.value = raw;
    const exists = window.BuilderState.getDraftsArray().some(
      (d) =>
        d &&
        d.id === raw &&
        raw !== (window.BuilderState.builderState?.id || "")
    );
    if (!idRegex.test(raw))
      idHelp.textContent = "Only lowercase letters, numbers and _ are allowed.";
    else if (exists)
      idHelp.textContent =
        "Warning: this ID exists and will be overwritten on Save.";
    else idHelp.textContent = "";
    window.BuilderState.builderState.id = raw;
    window.BuilderPreview.triggerPreview();
    updateTabsLock();
  });

  titleEl.addEventListener("input", () => {
    window.BuilderState.builderState.title = titleEl.value;
    window.BuilderPreview.triggerPreview();
  });
  descEl.addEventListener("input", () => {
    window.BuilderState.builderState.desc = descEl.value;
    window.BuilderPreview.triggerPreview();
  });
}

/* ------------------------------------------------------
   People pickers — usa token de acceso (no pide token)
------------------------------------------------------ */
async function initPeoplePickers() {
  const info = document.getElementById("createdByInfo");
  const token = window.BuilderAccessToken || null;

  // Mostrar rol del token de acceso
  if (token) {
    const who = await window.BuilderAPI.whoAmI(token);
    if (who && who.ok && who.role) {
      info.textContent = `You are logged in as: ${String(
        who.role
      ).toUpperCase()}`;
    }
  }

  const { users = [] } = await window.BuilderAPI.listUsers(token).catch(() => ({
    users: [],
  }));

  // Excluir los 3 usuarios "team"
  const EXCLUDE_IDS = new Set(["tm_rm", "tm_ops", "tm_pa"]);
  const filtered = users.filter((u) => !EXCLUDE_IDS.has(u.id));

  const state = window.BuilderState.builderState;
  if (!Array.isArray(state.owners)) state.owners = [];
  if (!Array.isArray(state.experts)) state.experts = [];

  const mount = (rootId, bag) => {
    const root = document.getElementById(rootId);
    root.innerHTML = "";
    const sel = document.createElement("select");
    sel.innerHTML =
      `<option value="">— Select user —</option>` +
      filtered
        .map(
          (u) =>
            `<option value="${u.id}" data-img="${u.img}" data-name="${u.name}" data-email="${u.email}">${u.name}</option>`
        )
        .join("");
    const add = document.createElement("button");
    add.textContent = "Add";
    const chips = document.createElement("div");
    chips.className = "chips";
    const renderChips = () => {
      chips.innerHTML = "";
      bag.forEach((p, idx) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = window.BuilderUtils.shortName(p.name || p.id || "");
        const x = document.createElement("button");
        x.textContent = "×";
        x.addEventListener("click", () => {
          bag.splice(idx, 1);
          renderChips();
          window.BuilderPreview.triggerPreview();
        });
        chip.appendChild(x);
        chips.appendChild(chip);
      });
    };
    add.addEventListener("click", () => {
      const id = sel.value;
      if (!id) return;
      const opt = sel.selectedOptions[0];
      const entry = {
        id,
        name: opt.dataset.name,
        email: opt.dataset.email || "",
        img: opt.dataset.img || "",
      };
      if (!bag.find((x) => x.id === id)) {
        bag.push(entry);
        renderChips();
        window.BuilderPreview.triggerPreview();
      }
    });
    renderChips();
    root.append(sel, add, chips);
  };

  mount("ownersPicker", state.owners);
  mount("expertsPicker", state.experts);
}

/* ------------------------------------------------------
   Groups & Dropdowns Tab
------------------------------------------------------ */
function wireGroupsTab() {
  document.getElementById("btnAddGroup").addEventListener("click", () => {
    const topicEl = document.getElementById("newGroupTopic");
    const topic = topicEl.value.trim();
    if (!topic) return;
    window.BuilderState.addGroup(topic);
    topicEl.value = "";
    renderGroupsList();
    rebuildActiveDropdownSelector();
    window.BuilderPreview.triggerPreview();
  });
  document.getElementById("newGroupTopic").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btnAddGroup").click();
    }
  });
}

function renderGroupsList() {
  const list = document.getElementById("groupsList");
  list.innerHTML = "";
  if (!window.BuilderState.builderState) return;

  window.BuilderState.builderState.dropdownGroups.forEach((group, gi) => {
    const groupEl = document.createElement("div");
    groupEl.className = "group-item";

    const head = document.createElement("div");
    head.className = "group-head";
    const title = document.createElement("strong");
    title.textContent = group.topic || "(untitled group)";
    const actions = document.createElement("div");
    actions.className = "group-actions";
    actions.innerHTML = `
      <button aria-label="Move up">▲</button>
      <button aria-label="Move down">▼</button>
      <button aria-label="Rename">Rename</button>
      <button aria-label="Delete">Delete</button>
    `;
    const [btnUp, btnDown, btnRename, btnDelete] =
      actions.querySelectorAll("button");
    btnUp.addEventListener("click", () => {
      window.BuilderState.moveGroup(gi, -1);
      renderGroupsList();
      window.BuilderPreview.triggerPreview();
    });
    btnDown.addEventListener("click", () => {
      window.BuilderState.moveGroup(gi, 1);
      renderGroupsList();
      window.BuilderPreview.triggerPreview();
    });
    btnRename.addEventListener("click", () => {
      const newTopic = prompt("Group topic:", group.topic || "");
      if (newTopic != null) {
        window.BuilderState.builderState.dropdownGroups[gi].topic =
          newTopic.trim();
        renderGroupsList();
        window.BuilderPreview.triggerPreview();
      }
    });
    btnDelete.addEventListener("click", () => {
      if (confirm("Delete this group?")) {
        window.BuilderState.removeGroup(gi);
        renderGroupsList();
        rebuildActiveDropdownSelector();
        window.BuilderPreview.triggerPreview();
      }
    });

    head.append(title, actions);

    const body = document.createElement("div");
    body.className = "group-body";

    // Toolbar para crear dropdowns
    const addLine = document.createElement("div");
    addLine.className = "dropdown-item";
    addLine.innerHTML = `
      <input type="text" placeholder="New dropdown title" />
      <select>
        <option value="empty">empty</option>
        <option value="flowchart">flowchart</option>
      </select>
      <button>Add</button>
      <span></span>
    `;
    const [titleInp, typeSel, btnAdd] = addLine.querySelectorAll(
      "input,select,button"
    );
    btnAdd.addEventListener("click", () => {
      const t = titleInp.value.trim();
      const ty = typeSel.value;
      if (!t) return;
      const ok = window.BuilderState.addDropdown(gi, t, ty);
      if (ok) {
        titleInp.value = "";
        typeSel.value = "empty";
        renderGroupsList();
        rebuildActiveDropdownSelector();
        window.BuilderPreview.triggerPreview();
      } else {
        addLine.querySelector("span").textContent =
          "Dropdown title must be unique.";
      }
    });
    titleInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnAdd.click();
      }
    });
    typeSel.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnAdd.click();
      }
    });
    body.appendChild(addLine);

    // Lista de dropdowns existentes
    group.items.forEach((item, ii) => {
      const row = document.createElement("div");
      row.className = "dropdown-item";
      row.innerHTML = `
        <input value="${window.BuilderUtils.escapeAttr(item.title)}" />
        <select>
          <option value="empty" ${
            item.type === "empty" ? "selected" : ""
          }>empty</option>
          <option value="flowchart" ${
            item.type === "flowchart" ? "selected" : ""
          }>flowchart</option>
        </select>
        <div class="dropdown-actions">
          <button title="Up">▲</button>
          <button title="Down">▼</button>
          <button title="Delete">🗑</button>
        </div>
        <small></small>
      `;
      const [inp, sel, btnUpI, btnDownI, btnDelI] = [
        row.querySelector("input"),
        row.querySelector("select"),
        row.querySelectorAll("button")[0],
        row.querySelectorAll("button")[1],
        row.querySelectorAll("button")[2],
      ];
      const message = row.querySelector("small");

      inp.addEventListener("input", () => {
        const newTitle = inp.value.trim();
        if (!newTitle) return;
        if (!window.BuilderState.isUniqueTitle(newTitle, gi, ii)) {
          message.textContent = "Dropdown title must be unique.";
        } else {
          message.textContent = "";
          window.BuilderState.builderState.dropdownGroups[gi].items[ii].title =
            newTitle;
          if (
            !window.BuilderState.builderState.dropdownGroups[gi].items[ii].id
          ) {
            const id = window.BuilderUtils.slugifyTitleToId(
              newTitle,
              window.BuilderState.collectTakenIds()
            );
            window.BuilderState.builderState.dropdownGroups[gi].items[ii].id =
              id;
          }
          rebuildActiveDropdownSelector();
          window.BuilderPreview.triggerPreview();
        }
      });

      sel.addEventListener("change", () => {
        window.BuilderState.builderState.dropdownGroups[gi].items[ii].type =
          sel.value;
        if (
          window.BuilderState.active.groupIndex === gi &&
          window.BuilderState.active.itemIndex === ii
        )
          syncDetailToolbarVisibility();
        window.BuilderPreview.triggerPreview();
      });

      btnUpI.addEventListener("click", () => {
        window.BuilderState.moveDropdown(gi, ii, -1);
        renderGroupsList();
        window.BuilderPreview.triggerPreview();
      });
      btnDownI.addEventListener("click", () => {
        window.BuilderState.moveDropdown(gi, ii, 1);
        renderGroupsList();
        window.BuilderPreview.triggerPreview();
      });
      btnDelI.addEventListener("click", () => {
        if (confirm("Delete this dropdown?")) {
          window.BuilderState.removeDropdown(gi, ii);
          renderGroupsList();
          rebuildActiveDropdownSelector();
          window.BuilderPreview.triggerPreview();
        }
      });

      body.appendChild(row);
    });

    groupEl.append(head, body);
    list.appendChild(groupEl);
  });
}

/* ------------------------------------------------------
   Detail Tab helpers
------------------------------------------------------ */
function rebuildActiveDropdownSelector() {
  const sel = document.getElementById("selActiveDropdown");
  sel.innerHTML = "";
  const opts = [];
  window.BuilderState.builderState.dropdownGroups.forEach((g, gi) => {
    g.items.forEach((it, ii) => {
      const opt = document.createElement("option");
      opt.value = `${gi}:${ii}`;
      opt.textContent = `${g.topic || "(group)"} — [${ii + 1}] ${it.title}`;
      opts.push(opt);
    });
  });
  if (opts.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— No dropdowns yet —";
    sel.appendChild(o);
    document.getElementById("blocksList").innerHTML = "";
    syncDetailToolbarVisibility();
    return;
  }
  opts.forEach((o) => sel.appendChild(o));
  const current = `${window.BuilderState.active.groupIndex}:${window.BuilderState.active.itemIndex}`;
  sel.value = opts.find((o) => o.value === current) ? current : opts[0].value;
  const [gi, ii] = sel.value.split(":").map((n) => parseInt(n, 10));
  window.BuilderState.active.groupIndex = gi;
  window.BuilderState.active.itemIndex = ii;
  window.BuilderBlocks.renderBlocksEditor();
  syncDetailToolbarVisibility();
}

function syncDetailToolbarVisibility() {
  const btn = document.getElementById("btnFlowchart");
  const item = window.BuilderState.currentItem();
  const addBtns = document.querySelectorAll("#blockToolbar .btn-add");
  if (!item) {
    btn.style.display = "none";
    addBtns.forEach((b) => (b.disabled = true));
    return;
  }
  const isFlow = item.type === "flowchart";
  btn.style.display = isFlow ? "inline-block" : "none";
  addBtns.forEach((b) => (b.disabled = isFlow));
}

/* ------------------------------------------------------
   Review Tab — pide token SOLO en botones
------------------------------------------------------ */
function wireReviewTab() {
  const btnSave = document.getElementById("btnSaveDraft");
  const btnExport2 = document.getElementById("btnExportDrafts2");
  const import2 = document.getElementById("importFileInput2");
  const importBtn2 = document.getElementById("btnImportDrafts2");
  const btnDelete = document.getElementById("btnDeleteDraft");
  const btnPublish = document.getElementById("btnPublish");

  // Save (cualquier rol)
  btnSave.addEventListener("click", async () => {
    const a = window.BuilderState.sanitizeExport(
      window.BuilderState.builderState
    );
    if (!a.id) {
      return window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        "Article ID is required."
      );
    }
    const { token, ok } = await askTokenOrAbort("save draft", null);
    if (!ok) return;
    try {
      await window.BuilderAPI.upsertDraft(a, token);
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        `Draft "${a.id}" saved.`
      );
      await refreshDraftsSelect(
        document.getElementById("savedDraftsSelect"),
        token
      );
      document.getElementById("btnDeleteDraft").disabled = false;
    } catch (e) {
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        `Save failed: ${e.message}`
      );
    }
  });

  // Publish (sólo LEAD_ROLES)
  btnPublish.addEventListener("click", async () => {
    const a = window.BuilderState.sanitizeExport(
      window.BuilderState.builderState
    );
    if (!a.id) {
      return window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        "Article ID is required."
      );
    }
    const { token, ok } = await askTokenOrAbort(
      "publish",
      window.BuilderUtils.LEAD_ROLES
    );
    if (!ok) return;
    try {
      const r = await window.BuilderAPI.publishDraft(a.id, token);
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        r.ok ? `Published "${a.id}".` : "Publish failed"
      );
      await refreshArticlesSelect(
        document.getElementById("existingArticlesSelect"),
        token
      );
    } catch (e) {
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        `Publish failed: ${e.message}`
      );
    }
  });

  // Export (cualquier rol)
  btnExport2.addEventListener("click", async () => {
    const { ok } = await askTokenOrAbort("export drafts", null);
    if (!ok) return;
    window.BuilderState.exportDraftsFile();
  });

  // Import (cualquier rol) — pide token antes del file picker
  importBtn2.addEventListener("click", async () => {
    const { ok } = await askTokenOrAbort("import drafts", null);
    if (!ok) return;
    import2.click();
  });
  importBtn2.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      importBtn2.click();
    }
  });
  import2.addEventListener("change", async () => {
    if (import2.files && import2.files[0]) {
      const cnt = await window.BuilderState.importDraftsFromFile(
        import2.files[0]
      );
      const m = document.getElementById("reviewMessages");
      window.BuilderUtils.announce(m, `Imported ${cnt} draft(s) (runtime).`);
      const accessToken = window.BuilderAccessToken || null;
      if (accessToken)
        await refreshDraftsSelect(
          document.getElementById("savedDraftsSelect"),
          accessToken
        );
      import2.value = "";
    }
  });

  // Delete (sólo LEAD_ROLES)
  btnDelete.addEventListener("click", async () => {
    const id = window.BuilderState.builderState?.id;
    if (!id) return;
    if (!confirm(`Delete draft "${id}" from server?`)) return;

    const { token, ok } = await askTokenOrAbort(
      "delete draft",
      window.BuilderUtils.LEAD_ROLES
    );
    if (!ok) return;

    try {
      await window.BuilderAPI.deleteDraft(id, token);
      await refreshDraftsSelect(
        document.getElementById("savedDraftsSelect"),
        token
      );
      document.getElementById("btnDeleteDraft").disabled = true;
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        "Draft deleted."
      );
    } catch (e) {
      window.BuilderUtils.announce(
        document.getElementById("reviewMessages"),
        `Delete failed: ${e.message}`
      );
    }
  });
}

/* ------------------------------------------------------
   Shortcuts
------------------------------------------------------ */
function wireShortcuts() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      const result = window.BuilderState.saveDraftToArray();
      const msgs = document.getElementById("reviewMessages");
      if (msgs) window.BuilderUtils.announce(msgs, result.message);
    }
  });
}

// Export para uso en otros módulos
if (typeof window !== "undefined") {
  window.BuilderUI = {
    initStartPanel,
    refreshDraftsSelect,
    refreshArticlesSelect,
    openWorkspace,
    initTabsUI,
    wireBasicsTab,
    wireGroupsTab,
    renderGroupsList,
    rebuildActiveDropdownSelector,
    syncDetailToolbarVisibility,
    wireReviewTab,
    wireShortcuts,
    updateTabsLock,
  };
}
