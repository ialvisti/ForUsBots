// src/db/bigquery.js
const { BigQuery } = require("@google-cloud/bigquery");

const DATASET = "forusbots_analytics";
let _bq = null;

function bq() {
  if (_bq) return _bq;
  _bq = new BigQuery({ projectId: process.env.GCP_PROJECT });
  return _bq;
}

/**
 * Ejecuta una query parametrizada contra forusbots_analytics.
 * @param {string} query - SQL con @params nombrados (NO uses ? ni $1)
 * @param {object} params - { paramName: value }
 */
async function runQuery(query, params = {}) {
  const [rows] = await bq().query({
    query,
    params,
    location: "us-central1",
    maximumBytesBilled: "1000000000", // 1GB safety cap
  });
  return rows;
}

module.exports = { bq, runQuery, DATASET };
