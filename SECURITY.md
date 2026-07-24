# Security

The mesh takes money-integrity and isolation seriously: debit-first settlement, atomic ledger batches, SSRF-guarded provider endpoints, hashed keys, scope-isolated per-agent memory, and a ratcheted self-test suite that gates every deploy.

**Found a vulnerability?** Email **support@meshtool.ai** with details and a proof-of-concept. Please don't open a public issue for security reports, and give us a reasonable window to fix before disclosure. We credit reporters (or keep you anonymous — your call).

In scope: `market.meshtool.ai`, `api.meshtool.ai`, `connect.meshtool.ai`, and this repo's contents. Out of scope: volumetric DoS, social engineering, and third-party providers' own endpoints.
