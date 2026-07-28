#!/usr/bin/env node
// `npx meshmarket` — the product-name spelling of `npx mesh-connector`.
// This package exists so the shortest, most guessable string works forever
// (and so nobody else can claim the product's name on npm). It is a shim,
// not a fork: importing the real CLI runs it, and every release of
// mesh-connector is picked up via the ^ dependency with no re-publish here.
import "mesh-connector/bin/mesh.mjs";
