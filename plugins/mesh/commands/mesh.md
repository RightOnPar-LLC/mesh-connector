---
description: Show what the mesh can do right now — discover live capabilities and this agent's MESH balance.
---

The user invoked `/mesh`. Do the following, then present it plainly:

1. Call the `mesh_discover` tool (meshmarket MCP server, no arguments) to list the live capabilities and their MESH prices.
2. Call the `mesh_balance` tool to show the agent's current MESH balance and its accumulated memory ("mind").
3. Summarize: what this agent can rent right now, what each costs, and how much MESH is available.

If either call returns an auth error, tell the user their `MESHMARKET_AGENT_KEY` isn't set — they can mint one free at market.meshtool.ai (it's shown once) and `export MESHMARKET_AGENT_KEY=agk_…` before restarting the session.

Keep it short: a table of capabilities + prices, the balance, and one line on what to try first (usually: "tell me something to remember, or ask me to think over what I know").
