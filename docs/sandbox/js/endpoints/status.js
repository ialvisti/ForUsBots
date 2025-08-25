import { prettyResult } from "../core/utils.js";

export async function runStatus({ base, tokenValue, runResultEl }) {
  const res = await fetch(base + "/forusbot/status", {
    headers: tokenValue ? { "x-auth-token": tokenValue } : {},
  });
  const text = await res.text();
  prettyResult(runResultEl, res.status, text);
}
