// src/bots/forusall-search-participants/routes.js
const router = require("express").Router();
const bodyParser = require("body-parser");
const auth = require("../../middleware/auth");
const controller = require("./controller");

// POST /forusbot/search-participants
router.post(
  "/",
  auth, // requiere x-auth-token
  bodyParser.json({ limit: "1mb" }),
  controller
);

module.exports = router;
