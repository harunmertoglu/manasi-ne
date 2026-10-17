// @vitest-environment node
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  createNativeMessageDecoder,
  encodeNativeMessage,
} from "../helper/framing";
import { handleHelperRequest } from "../helper/host";
import { HelperError } from "../helper/store";
import {
  buildHostManifest,
  installHostManifests,
  resolveNativeMessagingDirs,
} from "../helper/install";

const execFileAsync = promisify(execFile);
const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..");

const tempDirs: string[] = [];
afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("encodes and decodes 4-byte UInt32LE frames across arbitrary chunk splits and rejects >1 MiB frames", () => {
  const received: unknown[] = [];
  const errors: Error[] = [];
  const decode = createNativeMessageDecoder(
    (m) => received.push(m),
    (e) => errors.push(e),
  );

  const frame1 = encodeNativeMessage({ id: "1", type: "HELPER_STATUS" });
  const frame2 = encodeNativeMessage({
    id: "2",
    type: "SUMMARIZE",
    text: "Merhaba dünya",
  });
  const combined = Buffer.concat([frame1, frame2]);

  decode(combined.subarray(0, 2));
  decode(combined.subarray(2, 11));
  decode(combined.subarray(11));

  expect(errors).toHaveLength(0);
  expect(received).toEqual([
    { id: "1", type: "HELPER_STATUS" },
    { id: "2", type: "SUMMARIZE", text: "Merhaba dünya" },
  ]);

  const oversizedHeader = Buffer.alloc(4);
  oversizedHeader.writeUInt32LE(2 * 1024 * 1024, 0);
  decode(oversizedHeader);
  expect(errors).toHaveLength(1);
});

it("dispatches helper commands and maps HelperError into structured failure responses", async () => {
  const fakeDeps = {
    sessions: {
      getStatus: async () => ({
        installed: true as const,
        version: "0.1.0",
        activeAccountId: "acct_1",
        accounts: [],
      }),
      signIn: async () => {
        throw new HelperError("oauth_cancelled", "İptal edildi.");
      },
      signOut: async () => ({
        installed: true as const,
        version: "0.1.0",
        accounts: [],
      }),
    },
    openai: {
      listModels: async () => [{ id: "gpt-5", label: "GPT-5" }],
      verifyModel: async () => {},
      summarize: async () => "Özet metin",
      explain: async () => ({
        word: "yüz",
        language: "tr" as const,
        explanation: "Başın ön bölümü.",
      }),
    },
  } as any;

  await expect(
    handleHelperRequest({ id: "req-1", type: "HELPER_STATUS" }, fakeDeps),
  ).resolves.toMatchObject({
    id: "req-1",
    ok: true,
    value: { installed: true, activeAccountId: "acct_1" },
  });

  await expect(
    handleHelperRequest({ id: "req-2", type: "AUTH_SIGN_IN" }, fakeDeps),
  ).resolves.toEqual({
    id: "req-2",
    ok: false,
    code: "oauth_cancelled",
    message: "İptal edildi.",
  });
});

it("validates extension IDs and writes native messaging manifests for Linux and macOS", async () => {
  const extId = "a".repeat(32);
  expect(() =>
    buildHostManifest({
      extensionId: "invalid-id",
      executablePath: "/abs/path/host.mjs",
    }),
  ).toThrow();

  const home = await mkdtemp(path.join(os.tmpdir(), "manasi-nm-"));
  tempDirs.push(home);

  const written = await installHostManifests({
    extensionId: extId,
    executablePath: "/opt/manasi/chatgpt-host.mjs",
    platform: "linux",
    homeDir: home,
    browsers: ["chrome", "chromium"],
  });

  expect(written).toHaveLength(2);
  const parsed = JSON.parse(await readFile(written[0], "utf8"));
  expect(parsed).toEqual({
    name: "com.manasi_nedir.chatgpt",
    description: "Manası Nedir yerel ChatGPT OAuth ve Responses API yardımcısı",
    path: "/opt/manasi/chatgpt-host.mjs",
    type: "stdio",
    allowed_origins: [`chrome-extension://${extId}/`],
  });
});

it("resolves native messaging directories including brave-origin for linux and darwin", () => {
  const linuxDirs = resolveNativeMessagingDirs("linux", "/custom/home");
  expect(linuxDirs).toEqual({
    chrome: path.join("/custom/home", ".config", "google-chrome", "NativeMessagingHosts"),
    chromium: path.join("/custom/home", ".config", "chromium", "NativeMessagingHosts"),
    brave: path.join(
      "/custom/home",
      ".config",
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    ),
    "brave-origin": path.join(
      "/custom/home",
      ".config",
      "BraveSoftware",
      "Brave-Origin",
      "NativeMessagingHosts",
    ),
    edge: path.join("/custom/home", ".config", "microsoft-edge", "NativeMessagingHosts"),
  });

  const darwinDirs = resolveNativeMessagingDirs("darwin", "/custom/home");
  expect(darwinDirs).toEqual({
    chrome: path.join(
      "/custom/home",
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
    ),
    chromium: path.join(
      "/custom/home",
      "Library",
      "Application Support",
      "Chromium",
      "NativeMessagingHosts",
    ),
    brave: path.join(
      "/custom/home",
      "Library",
      "Application Support",
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    ),
    "brave-origin": path.join(
      "/custom/home",
      "Library",
      "Application Support",
      "BraveSoftware",
      "Brave-Origin",
      "NativeMessagingHosts",
    ),
    edge: path.join(
      "/custom/home",
      "Library",
      "Application Support",
      "Microsoft Edge",
      "NativeMessagingHosts",
    ),
  });
});

it("installs manifest to brave-origin by default and allows explicit --browser brave-origin selection", async () => {
  const extId = "b".repeat(32);
  const home = await mkdtemp(path.join(os.tmpdir(), "manasi-nm-default-"));
  tempDirs.push(home);

  const written = await installHostManifests({
    extensionId: extId,
    executablePath: "/opt/manasi/chatgpt-host.mjs",
    platform: "linux",
    homeDir: home,
  });

  expect(written).toHaveLength(5);
  const braveOriginFile = path.join(
    home,
    ".config",
    "BraveSoftware",
    "Brave-Origin",
    "NativeMessagingHosts",
    "com.manasi_nedir.chatgpt.json",
  );
  expect(written).toContain(braveOriginFile);

  const parsed = JSON.parse(await readFile(braveOriginFile, "utf8"));
  expect(parsed).toEqual({
    name: "com.manasi_nedir.chatgpt",
    description: "Manası Nedir yerel ChatGPT OAuth ve Responses API yardımcısı",
    path: "/opt/manasi/chatgpt-host.mjs",
    type: "stdio",
    allowed_origins: [`chrome-extension://${extId}/`],
  });

  const homeExplicit = await mkdtemp(path.join(os.tmpdir(), "manasi-nm-explicit-"));
  tempDirs.push(homeExplicit);

  const writtenExplicit = await installHostManifests({
    extensionId: extId,
    executablePath: "/opt/manasi/chatgpt-host.mjs",
    platform: "linux",
    homeDir: homeExplicit,
    browsers: ["brave-origin"],
  });

  expect(writtenExplicit).toHaveLength(1);
  expect(writtenExplicit[0]).toBe(
    path.join(
      homeExplicit,
      ".config",
      "BraveSoftware",
      "Brave-Origin",
      "NativeMessagingHosts",
      "com.manasi_nedir.chatgpt.json",
    ),
  );
});

it("maintains parity between helper/install.ts and scripts/chatgpt-install.mjs", async () => {
  // @ts-ignore
  const mjsInstaller = await import("../scripts/chatgpt-install.mjs");
  const extId = "c".repeat(32);
  const testHome = "/mock/home/path";

  for (const plat of ["linux", "darwin"] as const) {
    const tsDirs = resolveNativeMessagingDirs(plat, testHome);
    const mjsDirs = mjsInstaller.resolveNativeMessagingDirs(plat, testHome);
    expect(mjsDirs).toEqual(tsDirs);
    expect(mjsDirs["brave-origin"]).toBeDefined();
    expect(mjsDirs["brave-origin"]).toContain(
      path.join("BraveSoftware", "Brave-Origin", "NativeMessagingHosts"),
    );
  }

  const tsHome = await mkdtemp(path.join(os.tmpdir(), "manasi-ts-"));
  const mjsHome = await mkdtemp(path.join(os.tmpdir(), "manasi-mjs-"));
  tempDirs.push(tsHome, mjsHome);

  const tsWrittenDefault = await installHostManifests({
    extensionId: extId,
    executablePath: "/path/to/host.mjs",
    platform: "linux",
    homeDir: tsHome,
  });

  const mjsWrittenDefault = await mjsInstaller.installHostManifests({
    extensionId: extId,
    executablePath: "/path/to/host.mjs",
    platform: "linux",
    homeDir: mjsHome,
  });

  expect(tsWrittenDefault).toHaveLength(5);
  expect(mjsWrittenDefault).toHaveLength(5);

  const tsBraveOrigin = tsWrittenDefault.find((p: string) => p.includes("Brave-Origin"))!;
  const mjsBraveOrigin = mjsWrittenDefault.find((p: string) => p.includes("Brave-Origin"))!;
  expect(tsBraveOrigin).toBeDefined();
  expect(mjsBraveOrigin).toBeDefined();

  const tsContent = await readFile(tsBraveOrigin, "utf8");
  const mjsContent = await readFile(mjsBraveOrigin, "utf8");
  expect(mjsContent).toBe(tsContent);
});

it("executes CLI chatgpt-install.mjs registering brave-origin by default and with --browser flag", async () => {
  const extId = "d".repeat(32);
  const cliPath = path.join(rootDir, "scripts", "chatgpt-install.mjs");

  // Test 1: default registration in isolated XDG_CONFIG_HOME
  const xdgDefault = await mkdtemp(path.join(os.tmpdir(), "manasi-xdg-default-"));
  tempDirs.push(xdgDefault);

  const { stdout: stdoutDefault } = await execFileAsync(
    process.execPath,
    [cliPath, "--extension-id", extId],
    {
      env: { ...process.env, XDG_CONFIG_HOME: xdgDefault },
    },
  );

  const braveOriginDefaultManifest = path.join(
    xdgDefault,
    "BraveSoftware",
    "Brave-Origin",
    "NativeMessagingHosts",
    "com.manasi_nedir.chatgpt.json",
  );
  expect(stdoutDefault).toContain(braveOriginDefaultManifest);
  const parsedDefault = JSON.parse(await readFile(braveOriginDefaultManifest, "utf8"));
  expect(parsedDefault.name).toBe("com.manasi_nedir.chatgpt");
  expect(parsedDefault.allowed_origins).toEqual([`chrome-extension://${extId}/`]);

  // Test 2: explicit --browser brave-origin
  const xdgExplicit = await mkdtemp(path.join(os.tmpdir(), "manasi-xdg-explicit-"));
  tempDirs.push(xdgExplicit);

  const { stdout: stdoutExplicit } = await execFileAsync(
    process.execPath,
    [cliPath, "--extension-id", extId, "--browser", "brave-origin"],
    {
      env: { ...process.env, XDG_CONFIG_HOME: xdgExplicit },
    },
  );

  const braveOriginExplicitManifest = path.join(
    xdgExplicit,
    "BraveSoftware",
    "Brave-Origin",
    "NativeMessagingHosts",
    "com.manasi_nedir.chatgpt.json",
  );
  expect(stdoutExplicit.trim()).toBe(`Kaydedildi: ${braveOriginExplicitManifest}`);

  // Test 3: explicit --browser=brave-origin
  const xdgEq = await mkdtemp(path.join(os.tmpdir(), "manasi-xdg-eq-"));
  tempDirs.push(xdgEq);

  const { stdout: stdoutEq } = await execFileAsync(
    process.execPath,
    [cliPath, `--extension-id=${extId}`, "--browser=brave-origin"],
    {
      env: { ...process.env, XDG_CONFIG_HOME: xdgEq },
    },
  );

  const braveOriginEqManifest = path.join(
    xdgEq,
    "BraveSoftware",
    "Brave-Origin",
    "NativeMessagingHosts",
    "com.manasi_nedir.chatgpt.json",
  );
  expect(stdoutEq.trim()).toBe(`Kaydedildi: ${braveOriginEqManifest}`);
});

it("spawns dist-helper/chatgpt-host.mjs and handles benign HELPER_STATUS probe in isolated environment", async () => {
  const isolatedHome = await mkdtemp(path.join(os.tmpdir(), "manasi-chatgpt-home-"));
  tempDirs.push(isolatedHome);

  const extId = "e".repeat(32);
  const hostPath = path.join(rootDir, "dist-helper", "chatgpt-host.mjs");

  const child = spawn(process.execPath, [hostPath, `chrome-extension://${extId}/`], {
    env: { ...process.env, MANASI_CHATGPT_HOME: isolatedHome },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const responses: any[] = [];
  const errors: Error[] = [];
  const decoder = createNativeMessageDecoder(
    (msg) => responses.push(msg),
    (err) => errors.push(err),
  );

  child.stdout.on("data", (chunk: Buffer) => {
    decoder(chunk);
  });

  const probe = encodeNativeMessage({ id: "benign-probe-1", type: "HELPER_STATUS" });
  child.stdin.write(probe);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timeout waiting for HELPER_STATUS response"));
    }, 5000);

    const check = () => {
      if (responses.length > 0) {
        clearTimeout(timeout);
        child.kill();
        resolve();
      } else {
        setTimeout(check, 20);
      }
    };
    check();
  });

  expect(errors).toHaveLength(0);
  expect(responses).toHaveLength(1);
  expect(responses[0]).toEqual({
    id: "benign-probe-1",
    ok: true,
    value: {
      installed: true,
      version: "0.1.0",
      accounts: [],
    },
  });
});
