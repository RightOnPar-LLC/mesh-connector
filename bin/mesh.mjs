#!/usr/bin/env node
// ── mesh — the MeshMarket CLI ─────────────────────────────────────────────
// Zero dependencies: global fetch + node:fs/os/path only, same posture as the
// rest of the mesh stack (edge-revenue-mcp, mesh-local, MeshForge). No arg-
// parsing library either — the surface here is small enough that hand-rolling
// it is less code than a dependency would be.
//
// Credentials live in ~/.mesh/credentials (mode 0600 where the OS honors it) —
// the same "plain file, restricted permissions, never logged back out" posture
// the whole estate already uses for secrets.env. The key is printed to the
// terminal exactly once, at signup, with an explicit "save this" note — it
// mirrors the API's own "shown once" contract, not a CLI-specific choice.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.MESH_API_BASE || "https://market.meshtool.ai";
const CRED_DIR = join(homedir(), ".mesh");
const CRED_FILE = join(CRED_DIR, "credentials");

function loadKey() {
  try { return JSON.parse(readFileSync(CRED_FILE, "utf8")).key || null; } catch { return null; }
}
function saveKey(handle, key) {
  mkdirSync(CRED_DIR, { recursive: true });
  writeFileSync(CRED_FILE, JSON.stringify({ handle, key }, null, 2));
  try { chmodSync(CRED_FILE, 0o600); } catch { /* no-op on filesystems that don't support POSIX modes */ }
}

async function api(method, path, { key, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (key) headers["x-agent-key"] = key;
  // Every fetch on the server side of this exchange carries a timeout
  // (AbortSignal.timeout throughout src/index.js) — the client talking to it
  // should hold itself to the same standard. Without this, a hung connection
  // leaves someone's terminal stuck forever with no way out but Ctrl-C.
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
  } catch (e) {
    const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
    return { status: 0, ok: false, body: { error: timedOut ? "request timed out after 25s" : `network error: ${e.message}` } };
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON response, e.g. a network-level failure page */ }
  return { status: res.status, ok: res.ok, body: json };
}

// A single, honest place every command reports through — so a 402 always
// shows the price and where to top up, a 401 always says how to sign up, and
// no command silently swallows a server error into a generic "it failed".
function report(r, okMessage) {
  if (r.ok) { if (okMessage) console.log(okMessage(r.body)); return true; }
  if (r.status === 401) console.error("Not signed in (or key rejected). Run: mesh signup <handle>");
  else if (r.status === 402) console.error(`Payment required — need ${r.body?.price ?? "?"} MESH, have ${r.body?.balance ?? "?"}. Run: mesh topup starter`);
  else if (r.status === 429) console.error(`Rate limited: ${r.body?.error || "slow down and try again shortly"}`);
  else console.error(`Error (HTTP ${r.status}): ${r.body?.error || JSON.stringify(r.body) || "no response body"}`);
  return false;
}

function need(key, name) {
  if (!key) { console.error(`Not signed in. Run: mesh signup <handle>`); process.exit(1); }
}

async function cmdSignup(handle, opts) {
  if (!handle) { console.error("usage: mesh signup <handle> [--ref <code>]"); process.exit(1); }
  const r = await api("POST", "/api/accounts", { body: { handle, referred_by: opts.ref || undefined } });
  if (!report(r)) process.exit(1);
  saveKey(handle, r.body.api_key);
  console.log(`Signed up as @${handle}.`);
  console.log(`Key saved to ${CRED_FILE} — SAVE A COPY ELSEWHERE TOO, it is shown once and this file can be deleted:`);
  console.log(`  ${r.body.api_key}`);
  console.log(`Starter balance: ${r.body.credits ?? "?"} MESH`);
}

async function cmdWhoami() {
  const key = loadKey();
  need(key);
  const r = await api("GET", "/api/account", { key });
  report(r, (b) => `@${b.handle} — ${b.credits} MESH\nRecent activity:\n` +
    (b.ledger || []).slice(0, 8).map((l) => `  ${l.created}  ${l.delta > 0 ? "+" : ""}${l.delta}  ${l.reason}`).join("\n"));
}

async function cmdDiscover(opts) {
  const q = opts.category ? `?category=${encodeURIComponent(opts.category)}` : "";
  const r = await api("GET", "/api/capabilities" + q);
  report(r, (b) => {
    const caps = Array.isArray(b) ? b : b.capabilities || [];
    if (!caps.length) return "(nothing listed yet)";
    const w = Math.max(...caps.map((c) => c.slug.length), 4);
    return caps.map((c) => `${c.slug.padEnd(w)}  ${String(c.price).padStart(4)} MESH  ${c.kind.padEnd(8)} ${c.provider || ""}`).join("\n");
  });
}

async function cmdCall(slug, opts) {
  if (!slug) { console.error('usage: mesh call <slug> --input \'{"...json..."}\''); process.exit(1); }
  const key = loadKey();
  need(key);
  let input = {};
  if (opts.input) { try { input = JSON.parse(opts.input); } catch { console.error("--input must be valid JSON"); process.exit(1); } }
  const r = await api("POST", `/api/call/${encodeURIComponent(slug)}`, { key, body: { input } });
  report(r, (b) => `Charged ${b.charged} MESH. Balance: ${b.balance}.\nResult:\n${JSON.stringify(b.result, null, 2)}`);
}

async function cmdList(opts) {
  if (!opts.name) { console.error("usage: mesh list --name <name> --price <n> [--kind tool|feed|workflow] [--endpoint <url>] [--steps '<json array>'] [--description <text>]"); process.exit(1); }
  const key = loadKey();
  need(key);
  const body = { name: opts.name, kind: opts.kind || "tool", price: Number(opts.price) || 1, description: opts.description || "", category: opts.category || "general" };
  if (opts.endpoint) body.endpoint = opts.endpoint;
  if (opts.steps) { try { body.steps = JSON.parse(opts.steps); } catch { console.error("--steps must be a JSON array"); process.exit(1); } }
  const r = await api("POST", "/api/capabilities", { key, body });
  report(r, (b) => `Listed "${b.slug}" — ${b.take_rate} take.${b.founding_supplier ? " 🏅 Founding supplier status granted." : ""}`);
}

async function cmdTopup(pack) {
  if (!pack) { console.error("usage: mesh topup <starter|builder|scale>"); process.exit(1); }
  const key = loadKey();
  need(key);
  const acc = JSON.parse(readFileSync(CRED_FILE, "utf8"));
  const r = await api("POST", "/api/account/buy", { body: { handle: acc.handle, pack } });
  report(r, (b) => `Open this to pay (${b.usd} USD -> ${b.mesh} MESH):\n  ${b.checkout_url}`);
}

function cmdLogout() {
  if (existsSync(CRED_FILE)) { unlinkSync(CRED_FILE); console.log("Signed out — credentials removed."); }
  else console.log("Not signed in.");
}

// ── mesh login — re-attach an existing key ───────────────────────────────────
// The signup key is shown once; before this command existed, moving to a new
// machine (or deleting ~/.mesh) orphaned the account — with credits in it.
// The key is verified against the live API BEFORE saving, so a typo'd key
// fails loudly here instead of as a confusing 401 three commands later.
async function cmdLogin(key) {
  if (!key) { console.error("usage: mesh login <agk_...>   (the key shown once at signup)"); process.exit(1); }
  const r = await api("GET", "/api/account", { key });
  if (!r.ok) { report(r); process.exit(1); }
  saveKey(r.body.handle, key);
  console.log(`Signed in as @${r.body.handle} — ${r.body.credits} MESH. Key saved to ${CRED_FILE}.`);
}

// ── mesh init — detect MCP clients and wire the mesh into them ───────────────
// Before this, wiring was copy-paste from three example files, per client, by
// hand — the last manual step between a stranger and a connected agent. Rules:
//   • NEVER clobber: configs are parsed first; a file that doesn't parse is
//     skipped with a warning (it's the user's config, maybe mid-edit — not ours
//     to "fix"), and every modified file gets a .mesh-backup sibling first.
//   • Keyless by default: the server's Authorization header is OPTIONAL —
//     browsing and mesh_signup work with no key, so wiring without one is a
//     working install, not a broken one. If a key is saved, it's included.
//   • Merge, don't replace: only mcpServers.meshmarket is touched; every other
//     server and setting in the file survives byte-for-byte (via JSON round-
//     trip — comments don't survive, which is why unparseable files are skipped
//     rather than rewritten).
const MCP_URL = () => BASE + "/mcp";

function clientTargets() {
  const home = homedir();
  const targets = [];
  // Claude Code keeps user-scope MCP servers at the top level of ~/.claude.json.
  const claudeJson = join(home, ".claude.json");
  if (existsSync(claudeJson))
    targets.push({ id: "claude-code", label: "Claude Code", file: claudeJson, entry: (key) => ({ type: "http", url: MCP_URL(), ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}) }) });
  // Cursor reads ~/.cursor/mcp.json globally (same shape as its per-project .cursor/mcp.json).
  const cursorDir = join(home, ".cursor");
  if (existsSync(cursorDir))
    targets.push({ id: "cursor", label: "Cursor", file: join(cursorDir, "mcp.json"), entry: (key) => ({ url: MCP_URL(), ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}) }) });
  // Claude Desktop can't reach remote servers natively — it goes through
  // mcp-remote, exactly as examples/claude-desktop.json documents.
  const desktopCfg = process.platform === "win32"
    ? join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
    : process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      : join(home, ".config", "Claude", "claude_desktop_config.json");
  if (existsSync(desktopCfg))
    targets.push({ id: "claude-desktop", label: "Claude Desktop", file: desktopCfg, entry: (key) => ({ command: "npx", args: ["-y", "mcp-remote", MCP_URL(), ...(key ? ["--header", `Authorization: Bearer ${key}`] : [])] }) });
  // VS Code (1.101+) speaks remote MCP natively, but its user-level mcp.json is
  // its own dialect: top-level key "servers" (NOT "mcpServers") and a typed
  // {"type":"http"} entry — one field wrong and VS Code shows nothing at all.
  const codeUser = process.platform === "win32"
    ? join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Code", "User")
    : process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Code", "User")
      : join(home, ".config", "Code", "User");
  if (existsSync(codeUser))
    targets.push({ id: "vscode", label: "VS Code", file: join(codeUser, "mcp.json"), topKey: "servers", entry: (key) => ({ type: "http", url: MCP_URL(), ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}) }) });
  return targets;
}

function cmdInit(opts) {
  const key = loadKey();
  const dry = "dry-run" in opts;
  let targets = clientTargets();
  if (opts.client) targets = targets.filter((t) => t.id === opts.client);
  if (!targets.length) {
    console.log(opts.client
      ? `No config found for "${opts.client}". Valid clients: claude-code, cursor, claude-desktop, vscode (must be installed).`
      : "No MCP clients detected (looked for Claude Code, Cursor, Claude Desktop). Wire one manually: https://github.com/RightOnPar-LLC/mesh-connector#quick-start");
    process.exit(opts.client ? 1 : 0);
  }
  let changed = 0;
  for (const t of targets) {
    let cfg = {};
    if (existsSync(t.file)) {
      try { cfg = JSON.parse(readFileSync(t.file, "utf8")); }
      catch { console.error(`  ✗ ${t.label} — ${t.file} is not valid JSON; skipped (fix it and rerun, nothing was touched)`); continue; }
    }
    const topKey = t.topKey || "mcpServers"; // VS Code's dialect uses "servers"
    const entry = t.entry(key);
    const current = (cfg[topKey] || {}).meshmarket;
    if (JSON.stringify(current) === JSON.stringify(entry)) { console.log(`  = ${t.label} — already wired (${t.file})`); continue; }
    if (dry) { console.log(`  → ${t.label} — would ${current ? "update" : "add"} ${topKey}.meshmarket in ${t.file}:\n      ${JSON.stringify(entry)}`); continue; }
    if (existsSync(t.file)) writeFileSync(t.file + ".mesh-backup", readFileSync(t.file));
    cfg[topKey] = { ...(cfg[topKey] || {}), meshmarket: entry };
    writeFileSync(t.file, JSON.stringify(cfg, null, 2));
    console.log(`  ✓ ${t.label} — ${current ? "updated" : "wired"} (backup: ${t.file}.mesh-backup)`);
    changed++;
  }
  if (!dry && changed) {
    console.log(`\nRestart the client(s) to pick up the change.`);
    console.log(key
      ? `Wired with your @${JSON.parse(readFileSync(CRED_FILE, "utf8")).handle} key — paid capability calls will settle in MESH.`
      : `Wired keyless — browsing and mesh_signup work now. To make paid calls: mesh signup <handle> (or mesh login <key>), then rerun mesh init.`);
  }
}

// Minimal, hand-rolled arg parsing: positional args first, then --flag value
// pairs. No dependency earns its keep at this surface size.
function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      // A flag followed by another flag (or by nothing) is a boolean, e.g.
      // `init --dry-run --client cursor` — without this, --dry-run would
      // swallow "--client" as its value and orphan "cursor".
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[a.slice(2)] = true;
      else { opts[a.slice(2)] = next; i++; }
    } else positional.push(a);
  }
  return { positional, opts };
}

const HELP = `mesh — the MeshMarket CLI (${BASE})

  mesh init [--dry-run] [--client <id>]    Wire the mesh into Claude Code /
                                           Cursor / Claude Desktop (auto-detects).
  mesh signup <handle> [--ref <code>]     Join the mesh. Free, no card.
  mesh login <agk_...>                     Re-attach an existing key.
  mesh whoami                              Your balance + recent activity.
  mesh discover [--category <name>]        List live capabilities and prices.
  mesh call <slug> --input '<json>'        Call a capability, pay per use.
  mesh list --name <name> --price <n>      List your own capability.
           [--kind tool|feed|workflow] [--endpoint <url>] [--steps '<json>']
  mesh topup <starter|builder|scale>       Get a real-money checkout link.
  mesh logout                              Forget the saved key.

Credentials: ${CRED_FILE}
Override the API base with MESH_API_BASE (useful for local dev against wrangler dev).`;

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const { positional, opts } = parseArgs(rest);
  switch (cmd) {
    case "init": return cmdInit(opts);
    case "signup": return cmdSignup(positional[0], opts);
    case "login": return cmdLogin(positional[0]);
    case "whoami": case "balance": return cmdWhoami();
    case "discover": case "ls": return cmdDiscover(opts);
    case "call": return cmdCall(positional[0], opts);
    case "list": return cmdList(opts);
    case "topup": case "buy": return cmdTopup(positional[0]);
    case "logout": return cmdLogout();
    default: console.log(HELP); process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error("Unexpected error:", e.message); process.exit(1); });
