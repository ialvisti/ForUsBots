// src/bots/forusall-emailtrigger/flows/index.js

const summaryAnnualNotice = require("./summary_annual_notice");

/**
 * Devuelve el handler según emailType
 * Cada handler debe exponer: async ({ page, selectors, meta, jobCtx }) => ({ result, reason, ... })
 */
function getFlowHandler(emailType) {
  switch (emailType) {
    case "summary_annual_notice":
      return summaryAnnualNotice;

    // agrega aquí los próximos flows:
    // case "monthly_balance": return require("./monthly_balance");
    // case "year_end_notice": return require("./year_end_notice");
    // case "notify_auto-escalation": return require("./notify_auto-escalation");
    // case "statement_notice": return require("./statement_notice");
    // case "sponsor_quarterly_email": return require("./sponsor_quarterly_email");
    // case "onboard_communications": return require("./onboard_communications");
    // case "new_hire_communications": return require("./new_hire_communications");
    // case "generic_email": return require("./generic_email");
    // case "force_out": return require("./force_out");

    default:
      return null;
  }
}

module.exports = { getFlowHandler };
