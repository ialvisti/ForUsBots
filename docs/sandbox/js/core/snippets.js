// docs/sandbox/js/core/snippets.js
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

  // helpers to safely inline JSON into single-quoted shell/js/py strings
  const escShell = (s) => s.replace(/'/g, `'\\''`);
  const escJs = (s) =>
    s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/'/g, "\\'");
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
    // Here-string (bash); good for examples
    httpie = `http --body ${
      ep.method
    } ${base}${url} Content-Type:application/json <<< '${escShell(
      jsonBodyStr
    )}'`;
  }

  // Node
  let node = `// Node.js 18+
const base='${base}';
const token='${tokLiteral}';
const res = await fetch(base + '${url}', {
  method: '${ep.method}',
  headers: {${
    isUpload
      ? `\n    'Content-Type': 'application/octet-stream',`
      : `\n    'Content-Type': 'application/json',`
  }${ep.needs?.token ? `\n    'x-auth-token': token,` : ""}${
    ep.needs?.xfilename ? `\n    'x-filename': '${fileName}',` : ""
  }${ep.needs?.meta ? `\n    'x-meta': JSON.stringify(${metaStr}),` : ""}
  },${
    isUpload
      ? `\n  body: require('node:fs').readFileSync('./${fileName}')`
      : isJsonWithBody
      ? `\n  body: '${escJs(jsonBodyStr)}'`
      : `\n  body: undefined`
  }
});
console.log(res.status, await res.text());`;

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
