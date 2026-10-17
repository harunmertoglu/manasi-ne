import { build } from "esbuild";
import { chmod, mkdir, rm } from "node:fs/promises";

await rm("dist-helper", { recursive: true, force: true });
await mkdir("dist-helper", { recursive: true });
await build({
  entryPoints: ["helper/host.ts"],
  outfile: "dist-helper/chatgpt-host.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
await chmod("dist-helper/chatgpt-host.mjs", 0o755);
