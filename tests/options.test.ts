import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("switches between Groq, Gemini, OpenRouter, and ChatGPT in Options UI and handles missing vs ready helper", async () => {
  const html = await readFile("public/options.html", "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;

  let helperInstalled = false;
  let currentProvider = "groq";
  const sentMessages: any[] = [];

  vi.stubGlobal("chrome", {
    runtime: {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sendMessage: async (msg: any) => {
        sentMessages.push(msg);
        if (msg.type === "SETTINGS_STATUS") {
          return {
            ok: true,
            value: {
              configured: true,
              provider: currentProvider,
              model: "llama-3",
              groq: { configured: true, model: "llama-3" },
              gemini: { configured: false },
              openrouter: { configured: false },
              chatgpt: { configured: false },
            },
          };
        }
        if (msg.type === "SELECT_PROVIDER") {
          currentProvider = msg.provider;
          return {
            ok: true,
            value: {
              configured: msg.provider === "groq",
              provider: msg.provider,
              model: msg.provider === "groq" ? "llama-3" : undefined,
              groq: { configured: true, model: "llama-3" },
              gemini: { configured: false },
              openrouter: { configured: false },
              chatgpt: { configured: false },
            },
          };
        }
        if (msg.type === "LIST_MODELS") {
          return {
            ok: true,
            value:
              msg.provider === "openrouter"
                ? [{ id: "openrouter/free", label: "openrouter/free" }]
                : [{ id: "gemini-2.5-flash", label: "gemini-2.5-flash" }],
          };
        }
        if (msg.type === "CHATGPT_HELPER_STATUS") {
          return {
            ok: true,
            value: helperInstalled
              ? {
                  installed: true,
                  version: "0.1.0",
                  activeAccountId: "acct_1",
                  accounts: [
                    {
                      accountId: "acct_1",
                      email: "user@example.com",
                      subject: "sub",
                      clientId: "cid",
                      grantedScopes: ["chatgpt.tokens.use.direct"],
                      state: "ready",
                      updatedAt: 1,
                    },
                  ],
                }
              : {
                  installed: false,
                  reason: "Yerel ChatGPT yardımcısı kurulu değil.",
                },
          };
        }
        return { ok: true, value: [] };
      },
    },
  });

  await import("../src/options");
  await vi.waitFor(() =>
    expect(document.querySelector("#active-provider-summary")!.textContent).toContain(
      "Groq",
    ),
  );

  const select = document.querySelector<HTMLSelectElement>("#provider")!;

  // Switch to Gemini
  select.value = "gemini";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLButtonElement>("#load-models")!.disabled,
    ).toBe(false),
  );
  expect(document.querySelector("#api-key-label")!.textContent).toContain(
    "Google Gemini API anahtarı",
  );
  expect(
    document.querySelector<HTMLInputElement>("#api-key")!.placeholder,
  ).toBe("AIza…");

  // Switch to OpenRouter
  select.value = "openrouter";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLButtonElement>("#load-models")!.disabled,
    ).toBe(false),
  );
  expect(document.querySelector("#api-key-label")!.textContent).toContain(
    "OpenRouter API anahtarı",
  );
  document.querySelector<HTMLButtonElement>("#load-models")!.click();
  await vi.waitFor(() =>
    expect(document.querySelector("#status")!.textContent).toContain(
      "Ücretsiz OpenRouter modelleri alındı",
    ),
  );
  expect(sentMessages).toContainEqual({
    type: "LIST_MODELS",
    provider: "openrouter",
    apiKey: "",
  });

  // Switch to ChatGPT (helper not installed yet)
  select.value = "chatgpt";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLElement>("#chatgpt-install-box")!.hidden,
    ).toBe(false),
  );
  expect(
    document.querySelector<HTMLElement>("#chatgpt-panel")!.hidden,
  ).toBe(false);
  expect(
    document.querySelector("#chatgpt-install-cmd")!.textContent,
  ).toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  // Helper becomes installed
  helperInstalled = true;
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect(
      document.querySelector("#chatgpt-helper-state")!.textContent,
    ).toContain("user@example.com"),
  );
  expect(
    document.querySelector<HTMLElement>("#chatgpt-install-box")!.hidden,
  ).toBe(true);
});
