// src/routes/articles-draft.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs").promises;
const { requireUser } = require("../middleware/auth"); // << cambia aquí

// ----- Publisher guard: admin + *_lead -----
const PUBLISH_ROLES = new Set([
  "admin",
  "pa_lead",
  "rm_lead",
  "ops_lead",
  "imp_lead",
]);
function requirePublisherRole(req, res, next) {
  const role = req?.auth?.role || "";
  if (!PUBLISH_ROLES.has(role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
}

// Directorios
const DOCS_DIR = path.join(__dirname, "..", "..", "docs");
const KB_DIR = path.join(DOCS_DIR, "Knwoledge_Database"); // (sic)
const DRAFT_DIR = path.join(KB_DIR, "Articles_Draft");
const PUBLISHED_DIR = path.join(KB_DIR, "Articles");

// Helpers
async function ensureDirs() {
  await fs.mkdir(DRAFT_DIR, { recursive: true });
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
}
function safeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}
async function readJson(fp) {
  const raw = await fs.readFile(fp, "utf8");
  return JSON.parse(raw);
}
async function writeJson(fp, obj) {
  const s = JSON.stringify(obj, null, 2);
  await fs.writeFile(fp, s, "utf8");
}
async function exists(fp) {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}
function validateArticle(a) {
  const errors = [];
  if (!a || typeof a !== "object") errors.push("Payload must be an object");
  if (!a.id || typeof a.id !== "string") errors.push('Missing "id" (string)');
  if (!a.title || typeof a.title !== "string")
    errors.push('Missing "title" (string)');
  if (a.dropdownGroups && !Array.isArray(a.dropdownGroups))
    errors.push('"dropdownGroups" must be an array');
  if (errors.length) {
    const err = new Error("Invalid article");
    err.status = 400;
    err.details = errors;
    throw err;
  }
}

// ====== Rutas ======

// --- PUBLICADOS (antes de /:id) ---
router.get("/_published", requireUser, async (_req, res) => {
  try {
    await ensureDirs();
    const files = (await fs.readdir(PUBLISHED_DIR)).filter((f) =>
      f.endsWith(".json")
    );
    const items = [];
    for (const f of files) {
      try {
        const j = await readJson(path.join(PUBLISHED_DIR, f));
        items.push({
          id: j.id,
          title: j.title || j.id,
          createdByName:
            (j.meta && j.meta.createdBy && j.meta.createdBy.name) || null,
        });
      } catch {}
    }
    const articles = Array.from(new Map(items.map((i) => [i.id, i])).values());
    res.json({ ok: true, total: articles.length, articles });
  } catch (e) {
    console.error("[published list]", e);
    res
      .status(500)
      .json({ ok: false, error: "Could not list published articles" });
  }
});

router.get("/_published/:id", requireUser, async (req, res) => {
  try {
    await ensureDirs();
    const id = safeSlug(req.params.id);
    const fp = path.join(PUBLISHED_DIR, `${id}.json`);
    if (!(await exists(fp)))
      return res.status(404).json({ ok: false, error: "Article not found" });
    const article = await readJson(fp);
    res.json({ ok: true, article });
  } catch (e) {
    console.error("[published get]", e);
    res
      .status(500)
      .json({ ok: false, error: "Could not read published article" });
  }
});

// --- BORRADORES ---

router.get("/", requireUser, async (_req, res) => {
  try {
    await ensureDirs();
    const files = (await fs.readdir(DRAFT_DIR)).filter((f) =>
      f.endsWith(".json")
    );
    const items = [];
    for (const f of files) {
      try {
        const j = await readJson(path.join(DRAFT_DIR, f));
        items.push({
          id: j.id,
          title: j.title || j.id,
          createdByName:
            (j.meta && j.meta.createdBy && j.meta.createdBy.name) || null,
        });
      } catch {}
    }
    const drafts = Array.from(new Map(items.map((i) => [i.id, i])).values());
    res.json({ ok: true, total: drafts.length, drafts });
  } catch (e) {
    console.error("[draft list]", e);
    res.status(500).json({ ok: false, error: "Could not list drafts" });
  }
});

// Crear/actualizar borrador (upsert)
router.post("/", requireUser, async (req, res) => {
  try {
    await ensureDirs();
    const payload = req.body || {};
    validateArticle(payload);
    payload.id = safeSlug(payload.id);

    if (!payload.meta) payload.meta = {};
    if (!payload.meta.createdAt)
      payload.meta.createdAt = new Date().toISOString();
    if (!payload.meta.createdBy && req.auth && req.auth.user) {
      payload.meta.createdBy = {
        id: req.auth.user.id || null,
        name: req.auth.user.name || null,
        email: req.auth.user.email || null,
        role: req.auth.role || null,
      };
    }

    const fp = path.join(DRAFT_DIR, `${payload.id}.json`);
    await writeJson(fp, payload);
    res.json({ ok: true, saved: true, id: payload.id });
  } catch (e) {
    const status = e.status || 500;
    res
      .status(status)
      .json({ ok: false, error: e.message, details: e.details || null });
  }
});

// Renombrar borrador
router.post("/:id/rename", requireUser, async (req, res) => {
  try {
    await ensureDirs();
    const oldId = safeSlug(req.params.id);
    const newId = safeSlug((req.body && req.body.newId) || "");
    if (!newId)
      return res.status(400).json({ ok: false, error: "newId required" });
    const oldFp = path.join(DRAFT_DIR, `${oldId}.json`);
    if (!(await exists(oldFp)))
      return res.status(404).json({ ok: false, error: "Draft not found" });
    const draft = await readJson(oldFp);
    draft.id = newId;
    const newFp = path.join(DRAFT_DIR, `${newId}.json`);
    await writeJson(newFp, draft);
    if (newFp !== oldFp) await fs.unlink(oldFp).catch(() => {});
    res.json({ ok: true, renamed: true, id: newId });
  } catch (e) {
    console.error("[draft rename]", e);
    res.status(500).json({ ok: false, error: "Could not rename draft" });
  }
});

// Publicar borrador -> Articles (sobrescribe)
router.post(
  "/:id/publish",
  requireUser,
  requirePublisherRole,
  async (req, res) => {
    try {
      await ensureDirs();
      const id = safeSlug(req.params.id);
      const src = path.join(DRAFT_DIR, `${id}.json`);
      if (!(await exists(src)))
        return res.status(404).json({ ok: false, error: "Draft not found" });
      const art = await readJson(src);
      validateArticle(art);

      if (!art.meta) art.meta = {};
      if (!art.meta.createdAt) art.meta.createdAt = new Date().toISOString();
      if (!art.meta.createdBy && req.auth && req.auth.user) {
        art.meta.createdBy = {
          id: req.auth.user.id || null,
          name: req.auth.user.name || null,
          email: req.auth.user.email || null,
          role: req.auth.role || null,
        };
      }

      const dst = path.join(PUBLISHED_DIR, `${id}.json`);
      await writeJson(dst, art);
      res.json({
        ok: true,
        published: true,
        id,
        path: dst.replace(KB_DIR + path.sep, ""),
      });
    } catch (e) {
      const status = e.status || 500;
      res
        .status(status)
        .json({ ok: false, error: e.message, details: e.details || null });
    }
  }
);

// Obtener un borrador por id
router.get("/:id", requireUser, async (req, res) => {
  try {
    await ensureDirs();
    const id = safeSlug(req.params.id);
    const fp = path.join(DRAFT_DIR, `${id}.json`);
    if (!(await exists(fp)))
      return res.status(404).json({ ok: false, error: "Draft not found" });
    const article = await readJson(fp);
    res.json({ ok: true, article });
  } catch (e) {
    console.error("[draft get]", e);
    res.status(500).json({ ok: false, error: "Could not read draft" });
  }
});

// Borrar borrador
router.delete("/:id", requireUser, requirePublisherRole, async (req, res) => {
  try {
    await ensureDirs();
    const id = safeSlug(req.params.id);
    const fp = path.join(DRAFT_DIR, `${id}.json`);
    if (!(await exists(fp)))
      return res.status(404).json({ ok: false, error: "Draft not found" });
    await fs.unlink(fp);
    res.json({ ok: true, deleted: true, id });
  } catch (e) {
    console.error("[draft delete]", e);
    res.status(500).json({ ok: false, error: "Could not delete draft" });
  }
});

module.exports = router;
