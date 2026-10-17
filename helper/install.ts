import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CHATGPT_HOST_NAME } from "../src/shared/chatgpt";

export const HOST_NAME = CHATGPT_HOST_NAME;

export function isValidExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id.trim());
}

export function resolveNativeMessagingDirs(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir(),
): Record<string, string> {
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

export function buildHostManifest(params: {
  extensionId: string;
  executablePath: string;
}) {
  const extId = params.extensionId.trim();
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

export async function installHostManifests(params: {
  extensionId: string;
  executablePath: string;
  browsers?: string[];
  platform?: NodeJS.Platform;
  homeDir?: string;
}): Promise<string[]> {
  const manifest = buildHostManifest({
    extensionId: params.extensionId,
    executablePath: params.executablePath,
  });
  const dirs = resolveNativeMessagingDirs(params.platform, params.homeDir);
  const selected =
    params.browsers && params.browsers.length > 0
      ? params.browsers
      : Object.keys(dirs);
  const written: string[] = [];
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
