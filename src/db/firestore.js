// src/db/firestore.js
const { Firestore, FieldValue, Timestamp } = require("@google-cloud/firestore");

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Firestore({
    projectId: process.env.GCP_PROJECT || undefined,
    ignoreUndefinedProperties: true,
    // Si FIRESTORE_EMULATOR_HOST está en env, el client lo detecta automáticamente
  });
  return _db;
}

const jobsCol = () => db().collection("jobs");
const eventsCol = () => db().collection("events");
const stagesCol = (jobId) => db().collection("jobs").doc(jobId).collection("stages");

module.exports = {
  db,
  jobsCol,
  eventsCol,
  stagesCol,
  FieldValue,
  Timestamp,
};
