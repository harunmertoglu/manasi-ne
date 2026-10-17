import { expect, it } from "vitest";
import { SettingsStore } from "../src/background/settings";
import { authorizeMessage } from "../src/shared/messages";
import { memoryArea } from "./helpers/chrome";
it("limits storage access and never replaces working settings on verification failure", async () => {
  const area = memoryArea();
  let reject = false;
  const store = new SettingsStore(area, () => ({
    verify: async () => {
      if (reject) throw new Error("bad");
    },
  }));
  await store.initialize();
  expect(area.access).toBe("TRUSTED_CONTEXTS");
  await store.validateAndSaveSettings("good-key", "model");
  reject = true;
  await expect(
    store.validateAndSaveSettings("bad-key", "model"),
  ).rejects.toThrow();
  expect(await store.getSettings()).toMatchObject({
    apiKey: "good-key",
    validated: true,
  });
  await store.clearSettings();
  expect(await store.getSettings()).toBeNull();
});
it("migrates legacy Groq settings and preserves saved Groq, Gemini, OpenRouter, and ChatGPT settings when switching providers", async () => {
  const area = memoryArea();
  area.data.settings = {
    apiKey: "legacy-key",
    model: "llama-3",
    validated: true,
  };
  const store = new SettingsStore(
    area,
    () => ({ verify: async () => {} }),
    () => ({ verify: async () => {} }),
  );
  expect(await store.getSettings()).toEqual({
    provider: "groq",
    apiKey: "legacy-key",
    model: "llama-3",
    validated: true,
  });

  await store.validateAndSaveApiKeySettings(
    "gemini",
    "AIzaSyGeminiKey",
    "models/gemini-2.5-flash",
  );
  expect(await store.getSettings()).toEqual({
    provider: "gemini",
    apiKey: "AIzaSyGeminiKey",
    model: "gemini-2.5-flash",
    validated: true,
  });

  await store.validateAndSaveApiKeySettings(
    "openrouter",
    "sk-or-v1-freekey",
    "openrouter/free",
  );
  expect(await store.getSettings()).toEqual({
    provider: "openrouter",
    apiKey: "sk-or-v1-freekey",
    model: "openrouter/free",
    validated: true,
  });

  await store.validateAndSaveChatGPTSettings("acct_1", "gpt-5");
  expect(await store.getSettings()).toEqual({
    provider: "chatgpt",
    accountId: "acct_1",
    model: "gpt-5",
    validated: true,
  });

  await store.selectProvider("groq");
  expect(await store.getSettings()).toEqual({
    provider: "groq",
    apiKey: "legacy-key",
    model: "llama-3",
    validated: true,
  });

  await store.selectProvider("gemini");
  expect(await store.getSettings()).toEqual({
    provider: "gemini",
    apiKey: "AIzaSyGeminiKey",
    model: "gemini-2.5-flash",
    validated: true,
  });
});
it("rejects website and content senders trying to access privileged settings", () => {
  const id = "extension";
  const content = {
    id,
    url: "https://example.com",
    tab: { id: 1 },
    frameId: 0,
  };
  expect(() =>
    authorizeMessage(
      { type: "SAVE_SETTINGS", apiKey: "key", model: "m" },
      content,
      id,
    ),
  ).toThrow();
  expect(() =>
    authorizeMessage({ type: "SETTINGS_STATUS" }, content, id),
  ).toThrow();
  expect(() =>
    authorizeMessage({ type: "START", tabId: 1 }, content, id),
  ).toThrow();
  expect(() =>
    authorizeMessage(
      { type: "CLEAR_SETTINGS" },
      { id: "other", url: "chrome-extension://extension/options.html" },
      id,
    ),
  ).toThrow();
  expect(
    authorizeMessage(
      { type: "CLEAR_SETTINGS" },
      { id, url: "chrome-extension://extension/options.html" },
      id,
    ),
  ).toEqual({ type: "CLEAR_SETTINGS" });
  expect(
    authorizeMessage(
      { type: "SELECT_PROVIDER", provider: "openrouter" },
      { id, url: "chrome-extension://extension/options.html" },
      id,
    ),
  ).toEqual({ type: "SELECT_PROVIDER", provider: "openrouter" });
  expect(() =>
    authorizeMessage(
      { type: "SELECT_PROVIDER", provider: "claude" },
      { id, url: "chrome-extension://extension/options.html" },
      id,
    ),
  ).toThrow();
});
it("takes content tab only from sender and rejects subframes/invalid payloads", () => {
  const sender = {
    id: "ext",
    url: "https://example.com",
    tab: { id: 7 },
    frameId: 0,
  };
  expect(
    authorizeMessage(
      { type: "INVALIDATE", generation: "g", tabId: 999 },
      sender,
      "ext",
    ).type,
  ).toBe("INVALIDATE");
  expect(() =>
    authorizeMessage(
      { type: "INVALIDATE", generation: "g" },
      { ...sender, frameId: 3 },
      "ext",
    ),
  ).toThrow();
  expect(() =>
    authorizeMessage(
      { type: "EXPLAIN", generation: "g", selection: { text: "x" } },
      sender,
      "ext",
    ),
  ).toThrow();
});
