const router = require("express").Router();
const requireUser = require("../../middleware/auth"); // mismo middleware que el scrape
const requireScope = require("../../middleware/requireScope");
const controller = require("./controller");

// POST /forusbot/forusall-update-participant
router.post("/", requireUser, requireScope("update-participant"), controller);

module.exports = router;
