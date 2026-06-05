// Bundles the stdio MCP server into a single zero-dependency file so it can be
// run with `npx github:Galxe/gravity-town gravity-town-mcp` — no clone, no build.
//
// Output: mcp-server/bin/gravity-town-mcp.mjs (committed to the repo).
// Rebuild after changing src/: `npm run build:bin` (from mcp-server/).
import { build } from "esbuild";

// ethers v5 calls `require("crypto")` (a Node built-in) at load time. esbuild's
// ESM output stubs `require`, so we re-inject a real one via createRequire.
const banner = [
  "#!/usr/bin/env node",
  'import { createRequire as __cr } from "module";',
  "const require = __cr(import.meta.url);",
].join("\n");

await build({
  entryPoints: ["src/index.ts"],
  outfile: "bin/gravity-town-mcp.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  banner: { js: banner },
});

console.log("Built bin/gravity-town-mcp.mjs");
