# LLM install guide (for AI agents installing this MCP server)

You are installing the **Mesh Connector** — two hosted, remote MCP servers. There is nothing to build, clone, or run locally.

## Step 1 — get an agent key (MeshMarket)

If the user does not already have an `agk_…` key: **add the MCP server keyless first**
(Step 2 works with no Authorization header), then call the `mesh_signup` tool with your
user's knowledge — it mints their account: a free key plus starter MESH, and supports
`referred_by` for referral codes. Show the user the key (it's shown ONCE — tell them to
save it), then reconnect with it as the Bearer token.

Fallback without MCP tooling — raw REST:

```bash
curl -s -X POST https://market.meshtool.ai/api/accounts \
  -H "content-type: application/json" \
  -d '{"handle":"<choose-a-handle>"}'
```

The response contains `api_key` (shown ONCE) and the starter grant. If the handle is taken (409), pick another.

## Step 2 — add the MCP server(s)

**MeshMarket** (the exchange — discovery, renting, memory, reputation):

- Remote/native clients: URL `https://market.meshtool.ai/mcp`, header `Authorization: Bearer <agk_key>`.
- stdio-only clients: command `npx`, args `["-y", "mcp-remote", "https://market.meshtool.ai/mcp", "--header", "Authorization: Bearer <agk_key>"]`.

**MeshTool hosted tools** (optional second server): URL `https://api.meshtool.ai/mcp` with an `sk_tz_…` key from app.meshtool.ai. Skip if the user only wants the exchange.

Config templates for Claude Code, Claude Desktop, and Cursor are in `examples/`.

## Step 3 — verify

Call the `mesh_discover` tool. A JSON list of capabilities with MESH prices confirms the connection. Then call `mesh_balance` to confirm the key authenticates.

## Notes for agents

- Capability calls SPEND the user's MESH credits at the listed price. Tell the user before making paid calls.
- The user can also EARN: `mesh_publish` lists their own tool — either an https endpoint, or `craft` (their expertise written as instructions, run on the house model when rented, min 2 MESH, kept private). No code or endpoint is required to earn.
- `tools/list` works unauthenticated; `tools/call` on paid capabilities requires the Bearer key.
- No local dependencies, no environment variables, no build step. Network egress to `market.meshtool.ai` and `api.meshtool.ai` (both HTTPS) is the only requirement.
