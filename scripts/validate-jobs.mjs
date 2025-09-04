// scripts/validate-jobs.mjs
import Ajv from "ajv";

const BASE = process.env.BASE || "http://localhost:10000/forusbot";
const TOKEN = process.env.TOKEN || "";
const LIMIT = Number(process.env.LIMIT || 200);
const STRICT = process.env.STRICT === "1";

if (!TOKEN) {
  console.error("Falta TOKEN (export TOKEN=...)");
  process.exit(2);
}

const res = await fetch(`${BASE}/jobs?limit=${LIMIT}`, {
  headers: { "x-auth-token": TOKEN },
});
if (!res.ok) {
  console.error("HTTP", res.status, await res.text());
  process.exit(2);
}
const body = await res.json();
const jobs = body?.jobs ?? body?.items ?? body ?? [];
if (!Array.isArray(jobs)) {
  console.error("Respuesta inesperada. No hay .jobs []");
  process.exit(2);
}

const ajv = new Ajv({ allErrors: true, strict: false });

const jobSchemaLoose = {
  $id: "JobLoose",
  type: "object",
  required: ["jobId", "botId", "state", "acceptedAt", "meta"],
  properties: {
    jobId: { type: "string" },
    botId: { type: "string" },
    state: {
      type: "string",
      enum: ["queued", "running", "succeeded", "failed", "canceled"],
    },
    acceptedAt: { type: "string" },
    startedAt: { type: ["string", "null"] },
    finishedAt: { type: ["string", "null"] },
    createdBy: { type: ["object", "null"] },
    meta: { type: "object" },
    error: { type: ["string", "null"] },
    // result existe cuando termina; si no terminó, puede faltar
    result: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          required: ["ok"],
          properties: {
            ok: { type: "boolean" },
          },
        },
      ],
    },
  },
};

const jobSchemaStrict = {
  $id: "JobStrict",
  type: "object",
  required: [
    "jobId",
    "botId",
    "state",
    "acceptedAt",
    "meta",
    "result",
    "stages",
  ],
  properties: {
    jobId: { type: "string" },
    botId: { type: "string" },
    state: {
      type: "string",
      enum: ["queued", "running", "succeeded", "failed", "canceled"],
    },
    acceptedAt: { type: "string" },
    startedAt: { type: ["string", "null"] },
    finishedAt: { type: ["string", "null"] },
    createdBy: { type: ["object", "null"] },
    meta: { type: "object" },
    error: { type: ["string", "null"] },
    stages: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "startedAt", "endedAt", "durationMs", "status"],
        properties: {
          name: { type: "string" },
          startedAt: { type: "string" },
          endedAt: { type: "string" },
          durationMs: { type: "number" },
          status: { type: "string", enum: ["succeed", "fail"] },
          meta: { type: ["object", "null"] },
          error: { type: ["object", "null"] },
        },
      },
    },
    result: {
      type: "object",
      required: ["ok", "code", "data", "warnings", "errors"],
      properties: {
        ok: { type: "boolean" },
        code: { type: "string", pattern: "^[A-Z0-9_]+$" },
        message: { type: ["string", "null"] },
        data: { type: ["object", "null"] },
        warnings: { type: "array" },
        errors: { type: "array" },
      },
    },
  },
};

const schema = STRICT ? jobSchemaStrict : jobSchemaLoose;
const validate = ajv.compile(schema);

let invalid = 0;
const byBot = new Map();

for (const j of jobs) {
  // En modo strict, sólo evaluamos terminados; en loose validamos todos
  const isFinished = !["queued", "running"].includes(j.state);
  if (STRICT && !isFinished) continue;

  const ok = validate(j);
  if (!ok) {
    invalid++;
    const errs = (validate.errors || [])
      .map((e) => `${e.instancePath || "."} ${e.message}`)
      .slice(0, 4)
      .join(" | ");
    console.log(`❌ ${j.jobId} ${j.botId} -> ${errs}`);
  }

  const s = byBot.get(j.botId) || { total: 0, bad: 0, states: new Map() };
  s.total++;
  if (!ok) s.bad++;
  s.states.set(j.state, (s.states.get(j.state) || 0) + 1);
  byBot.set(j.botId, s);
}

for (const [bot, s] of byBot.entries()) {
  const states = [...s.states.entries()]
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");
  console.log(`${s.bad ? "⚠️" : "✅"} ${bot} -> ${s.total - s.bad}/${s.total} válidos | ${states}`);
}

if (invalid) process.exit(1);
console.log("✅ Validación completada sin errores.");
