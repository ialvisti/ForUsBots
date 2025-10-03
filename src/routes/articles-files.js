// src/routes/articles-files.js
const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const { requireAdmin } = require("../middleware/auth");

const KB_DIR = path.join(__dirname, "..", "..", "docs", "Knwoledge_Database", "Articles");

function ensureKbDir() {
  try {
    fs.mkdirSync(KB_DIR, { recursive: true });
  } catch {}
}

function isValidId(id) {
  return typeof id === "string" && /^[a-z0-9_\-]+$/i.test(id);
}

function filePathFor(id) {
  return path.join(KB_DIR, `${id}.json`);
}

function safeReadJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toMeta(a) {
  // Lo mínimo que necesita el índice para listar
  if (!a || typeof a !== "object") return null;
  const { id, title, desc, owners, experts } = a;
  return { id, title, desc, owners: owners || [], experts: experts || [] };
}

// GET /forusbot/articles → lista (solo metadata)
router.get("/", (_req, res) => {
  try {
    ensureKbDir();
    const files = fs.readdirSync(KB_DIR).filter(f => f.endsWith(".json"));
    const list = files
      .map(f => safeReadJson(path.join(KB_DIR, f)))
      .filter(Boolean)
      .map(toMeta)
      .filter(Boolean)
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return res.json({ ok: true, total: list.length, articles: list });
  } catch (e) {
    console.error("[articles:list] error", e);
    return res.status(500).json({ ok: false, error: "Could not list articles" });
  }
});

// GET /forusbot/articles/:id → artículo completo
router.get("/:id", (req, res) => {
  try {
    ensureKbDir();
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }
    const fp = filePathFor(id);
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    const data = safeReadJson(fp);
    return res.json({ ok: true, article: data });
  } catch (e) {
    console.error("[articles:get] error", e);
    return res.status(500).json({ ok: false, error: "Could not get article" });
  }
});

// POST /forusbot/articles → create/update (ADMIN)
// Body: { id, title, desc, dropdownGroups, owners, experts }
router.post("/", requireAdmin, (req, res) => {
  try {
    ensureKbDir();
    const body = req.body || {};
    const { id } = body;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Missing or invalid 'id'. Use [a-zA-Z0-9_-]" });
    }
    if (!body.title || typeof body.title !== "string") {
      return res.status(400).json({ ok: false, error: "Missing 'title'" });
    }

    // Normalización ligera para evitar campos gigantes/accidentales
    const record = {
      id: String(body.id),
      title: String(body.title),
      desc: typeof body.desc === "string" ? body.desc : (body.desc || ""),
      dropdownGroups: Array.isArray(body.dropdownGroups) ? body.dropdownGroups : [],
      owners: Array.isArray(body.owners) ? body.owners : [],
      experts: Array.isArray(body.experts) ? body.experts : [],
    };

    const fp = filePathFor(record.id);
    fs.writeFileSync(fp, JSON.stringify(record, null, 2), "utf8");
    return res.json({ ok: true, saved: record.id });
  } catch (e) {
    console.error("[articles:post] error", e);
    return res.status(500).json({ ok: false, error: "Could not save article" });
  }
});

// DELETE /forusbot/articles/:id (ADMIN)
router.delete("/:id", requireAdmin, (req, res) => {
  try {
    ensureKbDir();
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }
    const fp = filePathFor(id);
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    fs.unlinkSync(fp);
    return res.json({ ok: true, deleted: id });
  } catch (e) {
    console.error("[articles:delete] error", e);
    return res.status(500).json({ ok: false, error: "Could not delete article" });
  }
});

module.exports = router;
