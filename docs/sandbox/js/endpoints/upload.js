// docs/sandbox/js/endpoints/upload.js
import { prettyResult } from "../core/utils.js";

export async function runDryUpload({
  base,
  headers,
  bodyPromise,
  runResultEl,
}) {
  const url = "/forusbot/sandbox/vault-file-upload";
  const body = bodyPromise ? await bodyPromise : new Uint8Array();
  const res = await fetch(base + url, { method: "POST", headers, body });
  const txt = await res.text();
  prettyResult(runResultEl, res.status, txt);
  return { res, text: txt };
}
