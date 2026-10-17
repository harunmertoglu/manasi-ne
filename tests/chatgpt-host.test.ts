// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
} from "../helper/install";

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
