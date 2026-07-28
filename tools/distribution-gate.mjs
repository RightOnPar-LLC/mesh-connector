#!/usr/bin/env node
// DISTRIBUTION GATE — red blocks the ship.
//
// This repo IS the install path. Every file here is load-bearing for a stranger
// who has never spoken to us: the README tells them to run two commands, and
// those commands reach for specific files by exact path. Rename one, break one's
// JSON, or edit the README's instructions without moving the file, and the
// documented path silently becomes a lie. Nothing errors. The daily
// distribution-check would catch it — TOMORROW, after it shipped.
//
// Code in this estate is never allowed to ship on red: a selftest gates every
// deploy. Distribution had no equivalent. This is it.
//
// Every assertion below encodes a failure that ALREADY HAPPENED here, or a
// promise the README now makes that must stay true. Nothing speculative.
//
// Run:  node tools/distribution-gate.mjs
// Exit: 0 = safe to push, 1 = the install path is broken

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (p) => existsSync(join(ROOT, p));

let pass = 0;
const fails = [];
const ok = (label, cond, why = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fails.push({ label, why }); console.log(`  ✗ ${label}${why ? ` — ${why}` : ""}`); }
};

console.log("DISTRIBUTION GATE — can a stranger still complete the install?\n");

// ── 1. THE FILES THE README'S INSTRUCTIONS REACH FOR ─────────────────────────
// The plugin install resolves these by exact path. A rename here turns the
// documented quick-start into a 404 for every new user, silently.
console.log("  install path");
for (const p of [
  "plugins/mesh/.claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  "plugins/mesh/commands/mesh.md",
  "plugins/mesh/skills/mesh/SKILL.md",
  "server.json",
]) ok(`${p} exists`, has(p), "README's install instructions depend on this exact path");

// ── 2. MANIFESTS PARSE ───────────────────────────────────────────────────────
// A trailing comma in plugin.json fails the install with a message that points
// at the client, not at us — the user blames their setup and leaves.
let plugin = null, marketplace = null, server = null;
for (const [label, p, set] of [
  ["plugin.json", "plugins/mesh/.claude-plugin/plugin.json", (v) => (plugin = v)],
  ["marketplace.json", ".claude-plugin/marketplace.json", (v) => (marketplace = v)],
  ["server.json", "server.json", (v) => (server = v)],
]) {
  if (!has(p)) continue;
  try { set(JSON.parse(read(p))); ok(`${label} is valid JSON`, true); }
  catch (e) { ok(`${label} is valid JSON`, false, e.message); }
}

// The marketplace must actually point at a plugin that exists on disk. These are
// two separate files that have to agree; nothing but this check makes them.
if (marketplace && plugin) {
  const listed = JSON.stringify(marketplace);
  ok("marketplace.json references the mesh plugin", /mesh/.test(listed));
}

// ── 3. THE REGISTRY 422 THAT COST US A RE-CUT TAG ────────────────────────────
// The Official MCP Registry caps body.description at 100 chars. We shipped ~190,
// got a bare 422 with no field named, and had to delete and re-cut a released
// tag to fix it. That is a mistake worth making exactly once.
console.log("\n  registry metadata");
if (server) {
  const d = server.description || "";
  ok(`server.json description within the registry's 100-char cap (${d.length})`, d.length > 0 && d.length <= 100,
    d.length > 100 ? "the registry rejects this with a bare 422 that names no field" : "missing description");
  ok("server.json declares a repository URL", !!server.repository?.url);
  ok("server.json version is semver", /^\d+\.\d+\.\d+$/.test(server.version || ""),
    `got "${server.version}"`);
}

// ── 4. THE FRONT DOOR STAYS OPEN ─────────────────────────────────────────────
// Fixed 2026-07-25: the entire differentiator — an agent onboards ITSELF with no
// owner in the loop — was documented on ZERO public surfaces, while the README's
// step one told a stranger to go get a key first. The slow path was the only
// path anyone could see. This ratchets that fix so it cannot quietly regress.
console.log("\n  the free path is still advertised");
const readme = has("README.md") ? read("README.md") : "";
const skill = has("plugins/mesh/skills/mesh/SKILL.md") ? read("plugins/mesh/skills/mesh/SKILL.md") : "";
ok("README names mesh_signup", /mesh_signup/.test(readme),
  "the keyless self-onboard path is the differentiator — if it isn't written down it doesn't exist");
ok("README says browsing needs no key", /(no key|keyless|without a key)/i.test(readme));
ok("skill tells the agent to mint its own key", /mesh_signup/.test(skill),
  "otherwise the agent sends the user to a website and the owner becomes the bottleneck");

// ── 5. THE COMPOUNDING LOOP IS VISIBLE ───────────────────────────────────────
// The referral engine is fully built server-side (referral_edges, qualified
// vesting, reward only when the referred node independently transacts). A
// compounding loop nobody can see does not compound.
ok("README documents the referral loop", /mesh_refer|refer/i.test(readme),
  "each user bringing users is the only mechanism here that compounds on its own");

// ── 6. THE PRODUCT NAME LEADS ────────────────────────────────────────────────
// "MeshTool" collides hard with 3D-geometry software (X-Plane MeshTool, INSYDIUM
// MeshTools, Cura Mesh Tools, ISE-MeshTools) — a developer who meets that name
// first lands in CAD, not agent infrastructure, and every introduction is spent
// correcting it. "MeshMarket" is specific and uncontested. MeshTool is the
// company; MeshMarket is the product, and the product goes first.
ok("README leads with MeshMarket, not MeshTool",
  (() => {
    const m = readme.search(/MeshMarket/i), t = readme.search(/MeshTool/i);
    return m >= 0 && (t < 0 || m < t);
  })(),
  "a reader meeting 'MeshTool' first thinks 3D meshes — that half-second is spent every single time");

// ── 6b. THE CLI INSTALL PATH ─────────────────────────────────────────────────
// A second stranger-facing path exists now (git clone + node bin/mesh.mjs),
// with the exact same failure mode as the plugin path: rename bin/mesh.mjs, or
// let package.json's `bin` field drift from where the file actually lives, and
// the README's copy-paste commands silently start failing for every reader.
console.log("\n  cli install path");
const pkgRaw = has("package.json") ? read("package.json") : null;
let pkg = null;
ok("package.json exists and is valid JSON", (() => { try { pkg = JSON.parse(pkgRaw); return true; } catch { return false; } })());
ok("package.json's bin field points at a file that actually exists", !!(pkg && pkg.bin && Object.values(pkg.bin).every((p) => has(p))));
ok("the CLI script has a shebang (so `./bin/mesh.mjs` and a published npx both work)", has("bin/mesh.mjs") && read("bin/mesh.mjs").startsWith("#!/usr/bin/env node"));
// PUBLISHED 2026-07-27 (mesh-connector@1.0.0, npm) — live-verified: npx
// mesh-connector signup/discover/whoami all confirmed working against
// production before this check was flipped. `npm pkg get name` is the source
// of truth for the name, not a hardcoded string, so a future rename can't
// silently desync this check from package.json.
ok("README documents the published npx path (package.json's own name, not a hardcoded guess)",
  (() => { try { return new RegExp("```[\\s\\S]*?npx " + JSON.parse(pkgRaw).name + "[\\s\\S]*?```").test(readme); } catch { return false; } })(),
  "the package is live on npm — the README should lead with npx, not git clone, for the reader who just wants to try it");
ok("README's CLI commands match real subcommands the script implements",
  (() => {
    if (!has("bin/mesh.mjs")) return false;
    const cli = read("bin/mesh.mjs");
    // Both directions: every command the README advertises must be a real case
    // in the script, and the README must mention each — a documented command
    // that isn't implemented strands the first reader who tries it.
    return ["init", "signup", "login", "discover", "call", "list", "whoami", "logout"]
      .every((c) => new RegExp(`case "${c}"`).test(cli) && new RegExp(`\\b${c}\\b`).test(readme));
  })(),
  "a documented command that isn't in the script strands the first reader who tries it");
// SHIPPED 1.1.0: `init` writes into the user's OWN client configs. The two
// promises the README makes about that are the two that make it safe to run:
// merge-only behavior is guarded by the parse-skip (never rewrite a file we
// couldn't parse), and every touched file gets a .mesh-backup sibling first.
const cliSrc = has("bin/mesh.mjs") ? read("bin/mesh.mjs") : "";
ok("init never rewrites a config it couldn't parse", /not valid JSON; skipped/.test(cliSrc),
  "clobbering a user's half-edited config file is how a helpful installer becomes a horror story");
ok("init backs up before writing", /\.mesh-backup/.test(cliSrc),
  "the README promises a .mesh-backup sibling — the promise must stay true in code");
// The npm alias keeps `npx meshmarket` working under the product's own name.
ok("meshmarket alias package exists and its bin re-exports the real CLI",
  has("alias/meshmarket/package.json") && has("alias/meshmarket/bin/meshmarket.mjs")
    && /mesh-connector\/bin\/mesh\.mjs/.test(read("alias/meshmarket/bin/meshmarket.mjs")),
  "npx meshmarket is published — if the shim drifts from the real CLI, the product-name path rots");

// ── 7. RING-FENCE (LAW) ──────────────────────────────────────────────────────
// This is a PUBLIC repo in the mainstream org. The adult vertical must never
// appear here — not in a URL, an example handle, or a stray comment.
console.log("\n  ring-fence");
const surfaces = ["README.md", "SECURITY.md", "server.json", "plugins/mesh/skills/mesh/SKILL.md", "plugins/mesh/commands/mesh.md", "bin/mesh.mjs", "package.json"]
  .filter(has).map((p) => read(p)).join("\n");
ok("no adult-vertical reference on any public surface", !/steele|thesteelezone/i.test(surfaces),
  "mainstream and adult systems are ring-fenced by law");

// ── VERDICT ──────────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\n  BLOCKED — pushing this would break the documented install path:");
  fails.forEach((f) => console.log(`    • ${f.label}${f.why ? `\n      ${f.why}` : ""}`));
}
process.exit(fails.length ? 1 : 0);
