const router = require("express").Router();
const requireUser = require("../../middleware/auth"); // mismo middleware que el scrape
const controller = require("./controller");

// POST /forusbot/forusall-update-participant
router.post("/", requireUser, controller);

module.exports = router;
