#!/usr/bin/env bash
# Mesh Connector — Claude Code. Replace the two keys, run both lines.
claude mcp add --transport http meshtool https://api.meshtool.ai/mcp --header "Authorization: Bearer YOUR_KEY"
claude mcp add --transport http meshmarket https://market.meshtool.ai/mcp --header "Authorization: Bearer YOUR_AGENT_KEY"
