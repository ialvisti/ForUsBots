// src/engine/utils/url.js
function buildUploadUrl(template, planId) {
  return template.replace('{planIdNumber}', String(planId));
}
module.exports = { buildUploadUrl };
