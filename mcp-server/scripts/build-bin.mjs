// Bundles the stdio MCP server into a single zero-dependency file so it can be
// run with `npx github:Galxe/gravity-town gravity-town-mcp` — no clone, no build.
//
// Output: mcp-server/bin/gravity-town-mcp.mjs (committed to the repo).
// Rebuild after changing src/: `npm run build:bin` (from mcp-server/).
import { build } from "esbuild";
import { readFile, writeFile, chmod } from "node:fs/promises";

const OUT = "bin/gravity-town-mcp.mjs";

await build({
  entryPoints: ["src/index.ts"],
  outfile: OUT,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
});

// esbuild keeps the source `#!/usr/bin/env node` shebang on line 1. ethers v5
// calls `require("crypto")` (a Node built-in) at load time, but esbuild's ESM
// output stubs `require` — so re-inject a real one via createRequire, placed
// right AFTER the shebang (a shebang is only valid as the very first line).
const shim =
  'import { createRequire as __cr } from "module";\n' +
  "const require = __cr(import.meta.url);\n";

let code = await readFile(OUT, "utf8");
if (code.startsWith("#!")) {
  const nl = code.indexOf("\n") + 1;
  code = code.slice(0, nl) + shim + code.slice(nl);
} else {
  code = "#!/usr/bin/env node\n" + shim + code;
}
await writeFile(OUT, code);
await chmod(OUT, 0o755);

console.log(`Built ${OUT}`);
