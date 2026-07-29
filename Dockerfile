# Glama-release container: the same zero-dependency stdio↔HTTP bridge that
# ships in the Claude Desktop .mcpb (mcpb/server/index.js). MeshMarket itself
# is a hosted remote endpoint — nothing to install is the whole pitch — but
# Glama's quality evaluation runs against a buildable release, and this bridge
# IS the honest containerization: stdin JSON-RPC → market.meshtool.ai/mcp →
# stdout. No npm install, no lockfile, no dependencies to scan or rot.
FROM node:22-alpine
WORKDIR /app
COPY mcpb/server/index.js ./index.js
# Optional: pass MESHMARKET_AGENT_KEY for paid calls; keyless works for
# browsing and mesh_signup, same as every other door into the mesh.
ENV MESH_MCP_URL=https://market.meshtool.ai/mcp
CMD ["node", "index.js"]
