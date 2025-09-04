// scripts/validate-jobs-deep.mjs
import Ajv from "ajv";

const BASE = process.env.BASE || "http://localhost:10000/forusbot";
const TOKEN = process.env.TOKEN || "";
const LIMIT = Number(process.env.LIMIT || 200);

if (!TOKEN) {
  console.error("Falta TOKEN (export TOKEN=...)");
  process.exit(2);
}

const ajv = new Ajv({ allErrors: true, strict: false });

// ---------- Esquemas comunes ----------
const resultSchema = {
  type: "object",
  required: ["ok", "code", "data", "warnings", "errors"],
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    code: { type: "string" },
    message: { type: ["string", "null"] },
    data: { type: ["object", "null"] },
    warnings: { type: "array" },
    errors: { type: "array" },
  },
};

const stageSchema = {
  type: "object",
  required: ["name", "startedAt", "endedAt", "durationMs", "status"],
  additionalProperties: true,
  properties: {
    name: { type: "string" },
    startedAt: { type: "string" },
    endedAt: { type: "string" },
    durationMs: { type: "number" },
    status: { type: "string", enum: ["succeed", "fail"] },
    meta: { type: ["object", "null"] },
    error: { type: ["object", "null"] },
  },
};

const baseJobProps = {
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
  // Los endpoints pueden incluir métricas adicionales; se permiten
};

// Forma esperada en la LISTA /jobs (no exigimos stages aquí)
const listJobSchema = {
  type: "object",
  required: ["jobId", "botId", "state", "acceptedAt", "meta", "result"],
  additionalProperties: true,
  properties: {
    ...baseJobProps,
    result: resultSchema,
  },
};

// Forma esperada en el DETALLE /jobs/:id (exigimos stages[])
const singleJobSchema = {
  type: "object",
  required: ["jobId", "botId", "state", "acceptedAt", "meta", "result", "stages"],
  additionalProperties: true,
  properties: {
    ...baseJobProps,
    result: resultSchema,
    stages: {
      type: "array",
      items: stageSchema,
    },
  },
};

const vList = ajv.compile(listJobSchema);
const vSingle = ajv.compile(singleJobSchema);

// ---------- Util ----------
function explain(errors) {
  return (errors || [])
    .map((e) => `${e.instancePath || "."} ${e.message}`)
    .join(" | ");
}

// ---------- 1) Traer la lista ----------
const res = await fetch(`${BASE}/jobs?limit=${LIMIT}`, {
  headers: { "x-auth-token": TOKEN },
});
if (!res.ok) {
  console.error("HTTP", res.status, await res.text());
  process.exit(2);
}
const body = await res.json();
const jobs = body?.jobs ?? body?.items ?? (Array.isArray(body) ? body : []);
if (!Array.isArray(jobs)) {
  console.error("Respuesta inesperada en /jobs");
  process.exit(2);
}

if (jobs.length === 0) {
  console.log("ℹ️ No hay jobs para validar. Ejecuta 1 por cada bot y vuelve a correr el script.");
  process.exit(0);
}

let invalid = 0;
const byBot = new Map();

for (const j of jobs) {
  // 2) Validar forma en la lista
  const okList = vList(j);
  if (!okList) {
    invalid++;
    console.log(`❌ LIST /jobs -> ${j.jobId} ${j.botId} :: ${explain(vList.errors)}`);
  }

  // 3) Validar forma en el detalle
  const res2 = await fetch(`${BASE}/jobs/${encodeURIComponent(j.jobId)}`, {
    headers: { "x-auth-token": TOKEN },
  });
  if (!res2.ok) {
    invalid++;
    console.log(`❌ GET /jobs/${j.jobId} -> HTTP ${res2.status}`);
    continue;
  }
  const one = await res2.json();
  const okSingle = vSingle(one);
  if (!okSingle) {
    invalid++;
    console.log(`❌ GET /jobs/${j.jobId} ${j.botId} :: ${explain(vSingle.errors)}`);
  }

  // Stats por bot
  const s = byBot.get(j.botId) || { total: 0, bad: 0, states: new Map() };
  s.total++;
  if (!okList || !okSingle) s.bad++;
  s.states.set(j.state, (s.states.get(j.state) || 0) + 1);
  byBot.set(j.botId, s);
}

// ---------- Resumen ----------
for (const [bot, s] of byBot.entries()) {
  const states = [...s.states.entries()].map(([k, n]) => `${k}:${n}`).join(", ");
  console.log(`${s.bad ? "⚠️" : "✅"} ${bot} -> ${s.total - s.bad}/${s.total} válidos | ${states}`);
}

if (invalid) process.exit(1);
console.log("✅ Todos los jobs cumplen estructura lista+detalle.");
