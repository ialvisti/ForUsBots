const router = require("express").Router();
const requireUser = require("../../middleware/auth");
const restrictToEmails = require("../../middleware/restrictToEmails");
const controller = require("./controller");

// Allowlist: este endpoint es de uso restringido (real y sandbox).
const ALLOWED_EMAILS = ["ivan.alvis@forusall.com"];

// POST /forusbot/update-plan  (se monta en routes/index.js)
router.post("/", requireUser, restrictToEmails(ALLOWED_EMAILS), controller);

module.exports = router;
module.exports.ALLOWED_EMAILS = ALLOWED_EMAILS;
