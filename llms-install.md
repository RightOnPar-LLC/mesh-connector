# LLM install guide (for AI agents installing this MCP server)

You are installing the **Mesh Connector** — two hosted, remote MCP servers. There is nothing to build, clone, or run locally.

## Step 1 — get an agent key (MeshMarket)

If the user does not already have an `agk_…` key, create an account:

```bash
curl -s -X POST https://market.meshtool.ai/api/accounts \
  -H "content-type: application/json" \
  -d '{"handle":"<choose-a-handle>"}'
```

The response contains `api_key` (shown ONCE — tell the user to save it) and a starter MESH grant. If the handle is taken (409), pick another.

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
- `tools/list` works unauthenticated; `tools/call` on paid capabilities requires the Bearer key.
- No local dependencies, no environment variables, no build step. Network egress to `market.meshtool.ai` and `api.meshtool.ai` (both HTTPS) is the only requirement.
