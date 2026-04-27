// src/middleware/public-formatters.js
//
// Registro central de formatters por botId. Cada formatter recibe
// (result, record) — donde `result` es el envelope canónico
// {ok, code, message, data, warnings, errors} y `record` es el job
// completo (útil para acceder a `record.meta` cuando el dato público
// no está en `result.data`).

const formatters = {
  // botId tal como cada bot llama a queue.submit({ botId })
  "scrape-participant": require("../bots/forusall-scrape-participant/formatPublic"),
  "scrape-plan": require("../bots/forusall-scrape-plan/formatPublic"),
  "search-participants": require("../bots/forusall-search-participants/formatPublic"),
  "update-participant": require("../bots/forusall-update-participant/formatPublic"),
  "update-plan": require("../bots/forusall-update-plan/formatPublic"),
  "forusall-mfa-reset": require("../bots/forusall-mfa-reset/formatPublic"),
  "forusall-emailtrigger": require("../bots/forusall-emailtrigger/formatPublic"),
  "vault-file-upload": require("../bots/forusall-upload/formatPublic"),
};

function getFormatter(botId) {
  return formatters[botId] || null;
}

module.exports = { getFormatter, formatters };
