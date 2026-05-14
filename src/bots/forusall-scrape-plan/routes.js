const router = require("express").Router();
const requireUser = require("../../middleware/auth"); // auth por token
const requireScope = require("../../middleware/requireScope");
const controller = require("./controller");

// POST /forusbot/scrape-plan  (se monta en index.js)
router.post("/", requireUser, requireScope("scrape-plan"), controller);

module.exports = router;

