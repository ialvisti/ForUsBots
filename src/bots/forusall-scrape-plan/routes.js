const router = require("express").Router();
const requireUser = require("../../middleware/auth"); // auth por token
const controller = require("./controller");

// POST /forusbot/scrape-plan  (se monta en index.js)
router.post("/", requireUser, controller);

module.exports = router;

