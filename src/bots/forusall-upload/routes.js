// src/bots/forusall-upload/routes.js
const router = require('express').Router();
const bodyParser = require('body-parser');
const auth = require('../../middleware/auth');
const controller = require('./controller');

// Endpoint único: POST /forusbot/vault-file-upload
router.post(
  '/',
  auth,
  bodyParser.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '50mb' }),
  controller
);

module.exports = router;
