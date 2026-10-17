// @vitest-environment node
import { readFile, access } from "node:fs/promises";
import { expect, it } from "vitest";
it("packages a loadable MV3 extension with minimal permissions and local scripts", async () => {
  const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
  expect(manifest.manifest_version).toBe(3);
  expect([...manifest.permissions].sort()).toEqual([
    "activeTab",
    "scripting",
    "storage",
  ]);
  expect(manifest.host_permissions).toEqual(["https://api.groq.com/*"]);
  for (const file of [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    "options.js",
    "popup.js",
    "content.js",
    "ui.css",
  ])
    await access("dist/" + file);
  expect(await readFile("dist/content.js", "utf8")).not.toMatch(/^import\s/m);
  const options = await readFile("dist/options.html", "utf8");
  expect(options).not.toMatch(/<script[^>]+src="https?:/);
});
