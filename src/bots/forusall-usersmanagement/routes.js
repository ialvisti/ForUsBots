const router = require("express").Router();
const requireUser = require("../../middleware/auth");
const restrictToEmails = require("../../middleware/restrictToEmails");
const requireScope = require("../../middleware/requireScope");
const { createController, editController } = require("./controller");

const ALLOWED_EMAILS = [
  "ivan.alvis@forusall.com",
  "sponsorservicesbot@forusall.com",
];

router.post(
  "/create",
  requireUser,
  restrictToEmails(ALLOWED_EMAILS),
  requireScope("users-management"),
  createController
);

router.post(
  "/edit",
  requireUser,
  restrictToEmails(ALLOWED_EMAILS),
  requireScope("users-management"),
  editController
);

module.exports = router;
module.exports.ALLOWED_EMAILS = ALLOWED_EMAILS;
