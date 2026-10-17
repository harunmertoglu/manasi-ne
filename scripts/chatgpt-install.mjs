import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOST_NAME = "com.manasi_nedir.chatgpt";

export function isValidExtensionId(id) {
  return typeof id === "string" && /^[a-p]{32}$/.test(id.trim());
}

export function resolveNativeMessagingDirs(
  platform = process.platform,
  homeDir = os.homedir(),
) {
  if (platform === "darwin") {
    const base = path.join(homeDir, "Library", "Application Support");
    return {
      chrome: path.join(base, "Google", "Chrome", "NativeMessagingHosts"),
      chromium: path.join(base, "Chromium", "NativeMessagingHosts"),
      brave: path.join(
        base,
        "BraveSoftware",
        "Brave-Browser",
        "NativeMessagingHosts",
      ),
      edge: path.join(base, "Microsoft Edge", "NativeMessagingHosts"),
    };
  }
  const config =
    process.env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config");
  return {
    chrome: path.join(config, "google-chrome", "NativeMessagingHosts"),
    chromium: path.join(config, "chromium", "NativeMessagingHosts"),
    brave: path.join(
      config,
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    ),
    edge: path.join(config, "microsoft-edge", "NativeMessagingHosts"),
  };
}

export function buildHostManifest(params) {
  const extId = String(params?.extensionId ?? "").trim();
  if (!isValidExtensionId(extId)) {
    throw new Error(
      `Geçersiz Chrome eklenti kimliği: "${extId}". chrome://extensions sayfasındaki 32 karakterli kimliği girin.`,
    );
  }
  if (!path.isAbsolute(params.executablePath)) {
    throw new Error("Yardımcı çalıştırılabilir dosya yolu mutlak olmalıdır.");
  }
  return {
    name: HOST_NAME,
    description: "Manası Nedir yerel ChatGPT OAuth ve Responses API yardımcısı",
    path: params.executablePath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extId}/`],
  };
}

export async function installHostManifests(params) {
  const manifest = buildHostManifest({
    extensionId: params.extensionId,
    executablePath: params.executablePath,
  });
  const dirs = resolveNativeMessagingDirs(params.platform, params.homeDir);
  const selected =
    params.browsers && params.browsers.length > 0
      ? params.browsers
      : Object.keys(dirs);
  const written = [];
  for (const key of selected) {
    const dir = dirs[key];
    if (!dir) throw new Error(`Bilinmeyen tarayıcı hedefi: ${key}`);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${HOST_NAME}.json`);
    await writeFile(file, JSON.stringify(manifest, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o644,
    });
    await chmod(file, 0o644);
    written.push(file);
  }
  return written;
}

async function runCli() {
  const args = process.argv.slice(2);
  let extensionId = "";
  let printOnly = false;
  const browsers = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--extension-id" && args[i + 1]) {
      extensionId = args[++i];
    } else if (arg.startsWith("--extension-id=")) {
      extensionId = arg.slice("--extension-id=".length);
    } else if (arg === "--browser" && args[i + 1]) {
      browsers.push(args[++i]);
    } else if (arg === "--print") {
      printOnly = true;
    }
  }

  if (!extensionId) {
    console.error(
      "Kullanım: npm run chatgpt:install -- --extension-id <32-karakterli-eklenti-id> [--browser chrome|chromium|brave|edge] [--print]",
    );
    process.exit(1);
  }

  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const executablePath = path.join(rootDir, "dist-helper", "chatgpt-host.mjs");
  const manifest = buildHostManifest({ extensionId, executablePath });

  if (printOnly) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const files = await installHostManifests({
    extensionId,
    executablePath,
    browsers,
  });
  for (const file of files) {
    console.log(`Kaydedildi: ${file}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
