// docs/sandbox/es/js/core/snippets.js
export function buildSnippets(
  ep,
  baseUrl,
  xFilename,
  jobId,
  metaStr,
  jsonBodyStr = null
) {
  const base = (baseUrl.value || window.location.origin).replace(/\/$/, "");
  const fileName = xFilename?.value || "document.pdf";
  const tokLiteral = "YOUR_TOKEN_HERE";
  const url = ep.path.replace(":id", jobId?.value || "<jobId>");
  const isUpload = ep.group === "upload";
  const isJsonWithBody =
    !isUpload && typeof jsonBodyStr === "string" && jsonBodyStr.length > 0;

  // helpers to safely inline JSON
  const escShell = (s) => s.replace(/'/g, `'\\''`);
  const escPy = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  // cURL
  let curl = `curl -X ${ep.method} "${base}${url}" \\\n  -H "Content-Type: ${
    isUpload ? "application/octet-stream" : "application/json"
  }"`;
  if (ep.needs?.token) curl += ` \\\n  -H "x-auth-token: ${tokLiteral}"`;
  if (ep.needs?.xfilename) curl += ` \\\n  -H "x-filename: ${fileName}"`;
  if (ep.needs?.meta) curl += ` \\\n  -H 'x-meta: ${metaStr}'`;
  if (isUpload) {
    curl += ` \\\n  --data-binary @./${fileName}`;
  } else if (isJsonWithBody) {
    curl += ` \\\n  --data-raw '${escShell(jsonBodyStr)}'`;
  }

  // HTTPie
  let httpie = `http --body ${ep.method} ${base}${url} \\\n  Content-Type:${
    isUpload ? "application/octet-stream" : "application/json"
  }`;
  if (ep.needs?.token) httpie += ` \\\n  "x-auth-token:${tokLiteral}"`;
  if (ep.needs?.xfilename) httpie += ` \\\n  "x-filename:${fileName}"`;
  if (ep.needs?.meta) httpie += ` \\\n  "x-meta:${metaStr}"`;
  if (isUpload) {
    httpie += ` \\\n  < ./${fileName}`;
  } else if (isJsonWithBody) {
    httpie = `http --body ${
      ep.method
    } ${base}${url} Content-Type:application/json <<< '${escShell(
      jsonBodyStr
    )}'`;
  }

  // Node: literales JSON evitan convertir valores de solicitud en código.
  const js = (value) => JSON.stringify(String(value));
  let node = `// Node.js 18+
const token = process.env.FORUSBOTS_TOKEN || ${js(tokLiteral)};

async function main() {
  const base = ${js(base)};
  const path = ${js(url)};
  const res = await fetch(base + path, {
    method: ${js(ep.method)},
    headers: {${
    isUpload
      ? `\n    'Content-Type': 'application/octet-stream',`
      : `\n    'Content-Type': 'application/json',`
  }${ep.needs?.token ? `\n    'x-auth-token': token,` : ""}${
    ep.needs?.xfilename ? `\n    'x-filename': ${js(fileName)},` : ""
  }${ep.needs?.meta ? `\n    'x-meta': ${js(metaStr)},` : ""}
    },${
    isUpload
      ? `\n    body: require('node:fs').readFileSync(${js(`./${fileName}`)})`
      : isJsonWithBody
      ? `\n    body: ${js(jsonBodyStr)}`
      : `\n    body: undefined`
  }
  });
  console.log(res.status, await res.text());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});`;

  // Python
  let py = `# Python 3 + requests
import requests
base='${base}'
token='${tokLiteral}'
url='${url.replace(/'/g, "\\'")}'
headers={${
    isUpload
      ? `'Content-Type':'application/octet-stream'`
      : `'Content-Type':'application/json'`
  }${ep.needs?.token ? `,'x-auth-token':token` : ""}${
    ep.needs?.xfilename ? `,'x-filename':'${fileName}'` : ""
  }${ep.needs?.meta ? `,'x-meta': '${escPy(metaStr)}'` : ""}}
`;
  if (isUpload) {
    py += `data=open('./${fileName}','rb').read()
`;
  } else if (isJsonWithBody) {
    py += `data='${escPy(jsonBodyStr)}'
`;
  } else {
    py += `data=None
`;
  }
  py += `res=requests.request('${ep.method}', base+url, headers=headers, data=data)
print(res.status_code, res.text)`;

  return { curl, httpie, node, py };
}
