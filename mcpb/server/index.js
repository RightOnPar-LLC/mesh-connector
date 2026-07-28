#!/usr/bin/env node
// stdio ↔ streamable-HTTP bridge for the MeshMarket MCP endpoint.
//
// Claude Desktop runs bundled (.mcpb) servers as LOCAL stdio processes — it has
// no manifest field for a remote URL. The usual answer is to bundle mcp-remote
// and its node_modules tree; this file is the zero-dependency version of that
// answer, sized to what the bridge actually has to do:
//
//   stdin line (JSON-RPC)  →  POST https://market.meshtool.ai/mcp  →  stdout line
//
// That's the whole protocol. market.meshtool.ai/mcp is plain streamable HTTP
// returning application/json (no SSE stream to manage, no session handshake),
// so anything fancier than a line-pump would be borrowed weight. Same posture
// as bin/mesh.mjs: global fetch, node built-ins, nothing to install.
//
// The agent key arrives via env (MESHMARKET_AGENT_KEY) — Claude Desktop prompts
// for it at install time (manifest user_config, marked sensitive, OPTIONAL) and
// stores it in the OS keychain, not in a config file. Keyless is a working
// install: browsing and mesh_signup need no key, exactly like every other door
// into the mesh.

const ENDPOINT = process.env.MESH_MCP_URL || "https://market.meshtool.ai/mcp";
const KEY = (process.env.MESHMARKET_AGENT_KEY || "").trim();

let buf = "";
let pending = 0;
let stdinClosed = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) { pending++; relay(line).finally(() => { pending--; maybeExit(); }); }
  }
});
// When the client closes stdin, the session is over — but relays already in
// flight still owe the client their responses. Drain them, THEN exit; bailing
// immediately here silently ate every reply whenever input arrived as a pipe.
process.stdin.on("end", () => { stdinClosed = true; maybeExit(); });
function maybeExit() { if (stdinClosed && pending === 0) process.exit(0); }

async function relay(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; } // not JSON-RPC — drop, never crash the pipe
  const isNotification = msg.id === undefined || msg.id === null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
      body: line,
      // The server times out its own upstream calls; the bridge holds itself to
      // a ceiling too so a dead network can't wedge Claude Desktop's request.
      signal: AbortSignal.timeout(120000),
    });
    if (isNotification) return; // 202, no body expected, nothing to write back
    const text = await res.text();
    // Round-trip through JSON to GUARANTEE one line out per message in —
    // a pretty-printed or trailing-newline body would corrupt the stdio frame.
    process.stdout.write(JSON.stringify(JSON.parse(text)) + "\n");
  } catch (e) {
    if (isNotification) return;
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0", id: msg.id,
      error: { code: -32000, message: `bridge: ${e && e.name === "TimeoutError" ? "request timed out" : (e && e.message) || String(e)}` },
    }) + "\n");
  }
}
