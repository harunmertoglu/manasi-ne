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
