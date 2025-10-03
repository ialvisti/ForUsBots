// Js/builderState.js
// Gestión de estado y operaciones con drafts

/* ------------------------------------------------------
   Estado global del builder
------------------------------------------------------ */
let builderState = null; // artículo en edición (copia editable)
let active = { groupIndex: 0, itemIndex: 0 }; // puntero al dropdown activo

/* ------------------------------------------------------
   Acceso al array global draftArticles
------------------------------------------------------ */
function getDraftsArray() {
  if (typeof draftArticles !== "undefined" && Array.isArray(draftArticles))
    return draftArticles;
  if (!Array.isArray(window.draftArticles)) window.draftArticles = [];
  return window.draftArticles;
}

/* ------------------------------------------------------
   Personas helpers (owners/experts)
------------------------------------------------------ */
function normalizePeople(list) {
  return Array.isArray(list)
    ? list.filter(Boolean).map((p) => ({
        id: p.id || "",
        name: p.name || "",
        img: p.img || "",
        email: p.email || "",
      }))
    : [];
}

/* ------------------------------------------------------
   Operaciones de estado
------------------------------------------------------ */
function createNewDraft() {
  return {
    id: "",
    title: "",
    desc: "",
    dropdownGroups: [],
    owners: [],
    experts: [],
    meta: { status: "draft" },
  };
}

function sanitizeDraft(a) {
  return {
    id: a.id || "",
    title: a.title || "",
    desc: a.desc || "",
    dropdownGroups: Array.isArray(a.dropdownGroups)
      ? a.dropdownGroups.map((g) => ({
          topic: g.topic || "",
          items: Array.isArray(g.items)
            ? g.items.map((it) => ({
                id: it.id || "",
                title: it.title || "",
                type: it.type || "empty",
                detail: it.detail || "",
              }))
            : [],
        }))
      : [],
    owners: normalizePeople(a.owners),
    experts: normalizePeople(a.experts),
    meta: { ...(a.meta || {}), status: (a.meta && a.meta.status) || "draft" },
  };
}

function sanitizeExport(a) {
  return {
    id: a.id || "",
    title: a.title || "",
    desc: a.desc || "",
    dropdownGroups: (a.dropdownGroups || []).map((g) => ({
      topic: g.topic || "",
      items: (g.items || []).map((it) => ({
        id: it.id || "",
        title: it.title || "",
        type: it.type || "empty",
        detail: it.detail || "",
      })),
    })),
    owners: normalizePeople(a.owners),
    experts: normalizePeople(a.experts),
    meta: a.meta || {},
  };
}

function cloneFromArticle(article) {
  return {
    id: article.id + "_draft",
    title: article.title || "",
    desc: article.desc || "",
    dropdownGroups: (article.dropdownGroups || []).map((g) => ({
      topic: g.topic || "",
      items: (g.items || []).map((it) => ({
        id: it.id || "",
        title: it.title || "",
        type: /lucid\.app\/documents\/embedded/i.test(String(it.detail || ""))
          ? "flowchart"
          : "empty",
        detail: it.detail || "",
      })),
    })),
    owners: normalizePeople(article.owners),
    experts: normalizePeople(article.experts),
    meta: { status: "draft" },
  };
}

/* ------------------------------------------------------
   Groups & Dropdowns operations
------------------------------------------------------ */
function addGroup(topic) {
  builderState.dropdownGroups.push({ topic, items: [] });
}

function removeGroup(index) {
  builderState.dropdownGroups.splice(index, 1);
  if (active.groupIndex >= builderState.dropdownGroups.length) {
    active.groupIndex = Math.max(0, builderState.dropdownGroups.length - 1);
    active.itemIndex = 0;
  }
}

function moveGroup(index, dir) {
  const to = index + dir;
  if (to < 0 || to >= builderState.dropdownGroups.length) return;
  const [g] = builderState.dropdownGroups.splice(index, 1);
  builderState.dropdownGroups.splice(to, 0, g);
}

function addDropdown(groupIndex, title, type) {
  if (!isUniqueTitle(title, -1, -1)) {
    return false;
  }
  const id = window.BuilderUtils.slugifyTitleToId(title, collectTakenIds());
  builderState.dropdownGroups[groupIndex].items.push({
    id,
    title,
    type,
    detail: "",
  });
  return true;
}

function removeDropdown(groupIndex, itemIndex) {
  builderState.dropdownGroups[groupIndex].items.splice(itemIndex, 1);
  if (active.groupIndex === groupIndex) {
    active.itemIndex = Math.max(
      0,
      Math.min(
        active.itemIndex,
        builderState.dropdownGroups[groupIndex].items.length - 1
      )
    );
  }
}

function moveDropdown(groupIndex, itemIndex, dir) {
  const list = builderState.dropdownGroups[groupIndex].items;
  const to = itemIndex + dir;
  if (to < 0 || to >= list.length) return;
  const [it] = list.splice(itemIndex, 1);
  list.splice(to, 0, it);
}

/* ------------------------------------------------------
   Validation helpers
------------------------------------------------------ */
function isUniqueTitle(title, currentGroupIdx, currentItemIdx) {
  const t = title.toLowerCase().trim();
  for (let gi = 0; gi < builderState.dropdownGroups.length; gi++) {
    for (let ii = 0; ii < builderState.dropdownGroups[gi].items.length; ii++) {
      if (gi === currentGroupIdx && ii === currentItemIdx) continue;
      if (
        (builderState.dropdownGroups[gi].items[ii].title || "")
          .toLowerCase()
          .trim() === t
      )
        return false;
    }
  }
  return true;
}

function collectTakenIds() {
  const s = new Set();
  builderState.dropdownGroups.forEach((g) =>
    g.items.forEach((it) => {
      if (it.id) s.add(it.id);
    })
  );
  return s;
}

function currentItem() {
  const g = builderState.dropdownGroups[active.groupIndex];
  return g ? g.items[active.itemIndex] || null : null;
}

function setActiveDropdown(groupIndex, itemIndex) {
  active.groupIndex = groupIndex;
  active.itemIndex = itemIndex;
}

/* ------------------------------------------------------
   Persistence operations
------------------------------------------------------ */
function saveDraftToArray() {
  if (!builderState || !builderState.id) {
    return { success: false, message: "Article ID is required to save." };
  }

  const arr = getDraftsArray();
  const draft = sanitizeExport(builderState);

  const idx = arr.findIndex((a) => a && a.id === draft.id);
  if (idx >= 0) arr[idx] = draft;
  else arr.push(draft);

  return {
    success: true,
    message: `Draft "${draft.id}" saved to runtime draftArticles array.`,
  };
}

function deleteDraftFromArray() {
  if (!builderState || !builderState.id) return false;

  const arr = getDraftsArray();
  const idx = arr.findIndex((a) => a && a.id === builderState.id);
  if (idx >= 0) {
    arr.splice(idx, 1);
    return true;
  }
  return false;
}

function exportDraftsFile() {
  const arr = getDraftsArray().map(sanitizeExport);
  const content =
    "// Js/articlesDrafts.js (exported from runtime)\nconst draftArticles = " +
    JSON.stringify(arr, null, 2) +
    ";\n";
  const blob = new Blob([content], {
    type: "application/javascript;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "articlesDrafts.js";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importDraftsFromFile(file) {
  const text = await file.text();
  let arr = [];
  try {
    if (file.name.endsWith(".json")) {
      arr = JSON.parse(text);
    } else {
      const match = text.match(/draftArticles\s*=\s*(\[[\s\S]*?\]);?/);
      if (match) arr = JSON.parse(match[1]);
    }
  } catch (e) {
    alert("Invalid file format.");
    return 0;
  }
  if (!Array.isArray(arr)) {
    alert("File does not contain an array of drafts.");
    return 0;
  }

  const dst = getDraftsArray();
  let added = 0;
  arr.forEach((a) => {
    if (a && a.id) {
      const idx = dst.findIndex((d) => d && d.id === a.id);
      if (idx >= 0) dst[idx] = sanitizeExport(a);
      else dst.push(sanitizeExport(a));
      added++;
    }
  });
  return added;
}

// Export para uso en otros módulos
if (typeof window !== "undefined") {
  window.BuilderState = {
    // Estado
    get builderState() {
      return builderState;
    },
    set builderState(value) {
      builderState = value;
    },
    get active() {
      return active;
    },
    set active(value) {
      active = value;
    },

    // Operaciones
    getDraftsArray,
    createNewDraft,
    sanitizeDraft,
    sanitizeExport,
    cloneFromArticle,

    // Groups & Dropdowns
    addGroup,
    removeGroup,
    moveGroup,
    addDropdown,
    removeDropdown,
    moveDropdown,

    // Validation
    isUniqueTitle,
    collectTakenIds,
    currentItem,
    setActiveDropdown,

    // Persistence
    saveDraftToArray,
    deleteDraftFromArray,
    exportDraftsFile,
    importDraftsFromFile,
  };
}
