import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("keeps a failed start visible across status polls instead of replacing it with idle text", async () => {
  document.body.innerHTML =
    '<p id="status"></p><button id="start">Başlat</button><button id="stop"></button><button id="options"></button>';
  vi.stubGlobal("chrome", {
    tabs: { query: async () => [{ id: 1 }] },
    scripting: {
      executeScript: async () => {
        throw new Error("Bu sayfa okunamıyor.");
      },
    },
    runtime: {
      sendMessage: async (m: any) => ({
        ok: true,
        value: m.type === "SETTINGS_STATUS" ? { configured: true } : null,
      }),
      openOptionsPage: async () => {},
    },
  });
  await import("../src/popup");
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLButtonElement>("#start")!.disabled).toBe(
      false,
    ),
  );
  document.querySelector<HTMLButtonElement>("#start")!.click();
  await vi.waitFor(() =>
    expect(document.querySelector("#status")!.textContent).toContain(
      "Bu sayfa okunamıyor.",
    ),
  );
  await new Promise((r) => setTimeout(r, 1100));
  expect(document.querySelector("#status")!.textContent).toContain(
    "Bu sayfa okunamıyor.",
  );
});
