import { afterEach, expect, it, vi } from "vitest";
import { memoryArea } from "./helpers/chrome";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("does not submit a page after STOP interrupts router extraction", async () => {
  const local = memoryArea(),
    session = memoryArea();
  local.data.settings = { apiKey: "test-key", model: "m", validated: true };
  let listener: any, read!: (v: any) => void;
  let reading = false,
    requests = 0;
  vi.stubGlobal("fetch", async () => {
    requests++;
    return new Response("{}");
  });
  vi.stubGlobal("chrome", {
    storage: { local, session },
    runtime: {
      id: "ext",
      getPlatformInfo: async () => ({}),
      onMessage: { addListener: (fn: any) => (listener = fn) },
    },
    tabs: {
      get: async () => ({ id: 1, url: "https://example.com/" }),
      sendMessage: async (_id: number, m: any) => {
        if (m.type === "READ_PAGE") {
          reading = true;
          return new Promise((r) => (read = r));
        }
        return { ok: true };
      },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
  });
  await import("../src/background/index");
  const dispatch = (message: any) =>
    new Promise<any>((resolve) =>
      listener(
        message,
        { id: "ext", url: "chrome-extension://ext/popup.html" },
        resolve,
      ),
    );
  const start = dispatch({ type: "START", tabId: 1 });
  await vi.waitFor(() => expect(reading).toBe(true));
  await dispatch({ type: "STOP", tabId: 1 });
  read({
    ok: true,
    value: {
      url: "https://example.com/",
      title: "Old",
      paragraphs: ["Old page"],
      version: "old",
    },
  });
  expect(await start).toMatchObject({ ok: false, code: "stale_context" });
  expect(session.data["page:1"]).toBeUndefined();
  expect(requests).toBe(0);
});

it("routes ChatGPT helper commands and stops active pages on provider switch or sign-out", async () => {
  const local = memoryArea(),
    session = memoryArea();
  local.data.settings = {
    provider: "groq",
    groq: { apiKey: "test-key", model: "m", validated: true },
  };
  let listener: any;
  const nativeCalls: any[] = [];
  vi.stubGlobal("chrome", {
    storage: { local, session },
    runtime: {
      id: "ext",
      getPlatformInfo: async () => ({}),
      sendNativeMessage: async (_host: string, msg: any) => {
        nativeCalls.push(msg);
        if (msg.type === "HELPER_STATUS") {
          return {
            id: msg.id,
            ok: true,
            value: {
              installed: true,
              version: "0.1.0",
              activeAccountId: "acct_1",
              accounts: [
                {
                  accountId: "acct_1",
                  email: "a@b.com",
                  subject: "s",
                  clientId: "c",
                  grantedScopes: ["chatgpt.tokens.use.direct"],
                  state: "ready",
                  updatedAt: 1,
                },
              ],
            },
          };
        }
        if (msg.type === "VERIFY_MODEL") {
          return { id: msg.id, ok: true, value: { verified: true } };
        }
        if (msg.type === "AUTH_SIGN_OUT") {
          return {
            id: msg.id,
            ok: true,
            value: { installed: true, version: "0.1.0", accounts: [] },
          };
        }
        return { id: msg.id, ok: true, value: [] };
      },
      onMessage: { addListener: (fn: any) => (listener = fn) },
    },
    tabs: {
      query: async () => [],
      get: async () => ({ id: 1, url: "https://example.com/" }),
      sendMessage: async () => ({ ok: true }),
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
  });
  await import("../src/background/index");
  const dispatch = (message: any) =>
    new Promise<any>((resolve) =>
      listener(
        message,
        { id: "ext", url: "chrome-extension://ext/options.html" },
        resolve,
      ),
    );

  const statusRes = await dispatch({ type: "CHATGPT_HELPER_STATUS" });
  expect(statusRes).toMatchObject({
    ok: true,
    value: { installed: true, activeAccountId: "acct_1" },
  });

  const saveRes = await dispatch({
    type: "SAVE_CHATGPT_SETTINGS",
    accountId: "acct_1",
    model: "gpt-5",
  });
  expect(saveRes).toMatchObject({ ok: true });

  const settingsStatus = await dispatch({ type: "SETTINGS_STATUS" });
  expect(settingsStatus.value).toMatchObject({
    configured: true,
    provider: "chatgpt",
    model: "gpt-5",
    accountId: "acct_1",
  });

  await dispatch({ type: "CHATGPT_SIGN_OUT", accountId: "acct_1" });
  const afterSignOut = await dispatch({ type: "SETTINGS_STATUS" });
  expect(afterSignOut.value.chatgpt.configured).toBe(false);
  expect(afterSignOut.value.provider).toBe("groq");
});
