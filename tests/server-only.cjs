// Next.js handles this marker during builds. Standalone Node tests have no client bundle.
const Module = require("node:module");
const path = require.resolve("server-only");
const marker = new Module(path);
marker.exports = {};
marker.loaded = true;
require.cache[path] = marker;
