import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
test("configure own key, activate page, explain English/Turkish, cache, invalidate and stop", async () => {
  const extension = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-unsafe-extension-debugging",
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    // Mock only the external network boundary; extension UI, Chrome messaging and storage are real.
    await worker.evaluate(() => {
      const calls: any[] = [];
      (globalThis as any).__testCalls = calls;
      globalThis.fetch = async function (this: unknown, url, init) {
        // Native WorkerGlobalScope.fetch rejects an unrelated object receiver.
        if (this !== undefined && this !== globalThis)
          throw new TypeError("Illegal invocation");
        if (!String(url).startsWith("https://api.groq.com/openai/v1/"))
          throw new Error("Unexpected network URL");
        if (init?.method === "GET")
          return new Response(
            JSON.stringify({
              object: "list",
              data: [{ id: "test-text-model", object: "model", active: true }],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        const body = JSON.parse(init!.body as string);
        calls.push(body);
        const input = JSON.parse(body.messages[1].content);
        const content = input.check
          ? { ok: true }
          : input.selection
            ? input.selection.text === "headwinds"
              ? {
                  word: "headwinds",
                  language: "en",
                  explanation: "Conditions hindering the company’s progress.",
                  turkishEquivalent: "İlerlemeyi zorlaştıran olumsuz koşullar",
                }
              : {
                  word: input.selection.text,
                  language: "tr",
                  explanation: "Başın ön bölümü.",
                }
            : { summary: "A financial article with an example about a face." };
        return new Response(
          JSON.stringify({
            id: "chat-test",
            object: "chat.completion",
            created: 1,
            model: "test-text-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(content),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 10,
              total_tokens: 20,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      };
    });
    const getCalls = () =>
      worker.evaluate(() => (globalThis as any).__testCalls as any[]);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator("#api-key").fill("test-key-not-a-real-secret");
    await options.locator("#load-models").click();
    await expect(options.locator("#status")).toContainText("Modeller alındı");
    await expect(options.locator("#model option")).toHaveText([
      "test-text-model",
    ]);
    await options.locator("#save").click();
    await expect(options.locator("#status")).toContainText("Bağlantı hazır");
    await expect(options.locator("#api-key")).toHaveValue("");
    const page = await context.newPage();
    await context.route("http://manasi.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta charset="utf-8"><title>Market report</title></head><body style="font:20px Georgia;padding:60px"><main><h1>Market report</h1><p id="en">The company faces significant headwinds.</p><p id="tr">Bir yüz gördüm.</p></main></body></html>',
      }),
    );
    await page.goto("http://manasi.test/article");
    await page.bringToFront();
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const targetInfo = targetInfos.find((t) => t.url === page.url())!;
    await cdp.send("Extensions.triggerAction", {
      id,
      targetId: targetInfo.targetId,
    });
    const invokedTab = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url === "http://manasi.test/article")!;
    });
    // Headless action popups are not Playwright pages. Display the identical popup
    // document as a tab and point its active-tab lookup at the invoked real tab.
    const openPopup = async () => {
      const ui = await context.newPage();
      await ui.addInitScript((tab) => {
        chrome.tabs.query = (async () => [tab]) as typeof chrome.tabs.query;
      }, invokedTab);
      await ui.goto(`chrome-extension://${id}/popup.html`);
      return ui;
    };
    let popup = await openPopup();
    await expect(popup.locator("#stop")).toBeHidden();
    await expect(popup.locator("#start")).toBeEnabled();
    await popup.locator("#start").click();
    await expect(popup.locator("#status")).toContainText("Bağlam hazır");
    await popup.close();
    const select = async (selector: string, word: string) => {
      await page.evaluate(
        ({ selector, word }) => {
          const node = document.querySelector(selector)!.firstChild!;
          const start = node.textContent!.indexOf(word);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word.length);
          const selection = getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          document
            .querySelector(selector)!
            .dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        },
        { selector, word },
      );
    };
    await select("#en", "headwinds");
    await expect(page.locator("[data-manasi-root]")).toContainText(
      "Conditions hindering",
    );
    await expect(page.locator("[data-manasi-root]")).toContainText(
      "İlerlemeyi zorlaştıran",
    );
    const before = (await getCalls()).length;
    await page.locator("[data-manasi-root]").getByRole("button").click();
    await select("#en", "headwinds");
    await expect(page.locator("[data-manasi-root]")).toContainText(
      "Conditions hindering",
    );
    expect((await getCalls()).length).toBe(before);
    await page.locator("[data-manasi-root]").getByRole("button").click();
    await select("#tr", "yüz");
    await expect(page.locator("[data-manasi-root]")).toContainText(
      "Başın ön bölümü.",
    );
    expect(
      (await getCalls()).some((b) =>
        JSON.parse(b.messages[1].content).selection?.surrounding?.includes(
          "Bir yüz gördüm.",
        ),
      ),
    ).toBe(true);
    const local = await worker.evaluate(
      async () => await chrome.storage.local.get(null),
    );
    expect((local.settings as { apiKey: string }).apiKey).toBe(
      "test-key-not-a-real-secret",
    );
    const session = await worker.evaluate(
      async () => await chrome.storage.session.get(null),
    );
    expect(JSON.stringify(session)).not.toContain("test-key-not-a-real-secret");
    await page.evaluate(
      () => (document.querySelector("#en")!.textContent = "Changed article."),
    );
    await expect(page.locator("[data-manasi-root]")).toContainText(
      "Sayfa değişti",
    );
    await cdp.send("Extensions.triggerAction", {
      id,
      targetId: targetInfo.targetId,
    });
    popup = await openPopup();
    await expect(popup.locator("#status")).toContainText("Sayfa değişti");
    await popup.locator("#stop").click();
    await expect(popup.locator("#status")).toContainText("Hazır olduğunda");
    await popup.close();
    await select("#tr", "yüz");
    await expect(page.locator("[data-manasi-root]")).toHaveCount(0);
    await options.bringToFront();
    await options.locator("#delete").click();
    await expect(options.locator("#status")).toContainText("silindi");
    expect(
      await worker.evaluate(async () => await chrome.storage.local.get(null)),
    ).toEqual({});
  } finally {
    await context.close();
  }
});

test("configure Gemini, OpenRouter free models, and ChatGPT provider via native helper boundary", async () => {
  const extension = path.resolve("dist");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-unsafe-extension-debugging",
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;

    await worker.evaluate(() => {
      globalThis.fetch = async function (this: unknown, url, init) {
        if (this !== undefined && this !== globalThis)
          throw new TypeError("Illegal invocation");
        const u = String(url);
        if (
          u ===
          "https://generativelanguage.googleapis.com/v1beta/openai/models"
        ) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "models/gemini-2.5-flash",
                  display_name: "Gemini 2.5 Flash",
                },
              ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (u === "https://openrouter.ai/api/v1/models") {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "openrouter/free",
                  name: "OpenRouter Free Router",
                  pricing: { prompt: "0", completion: "0" },
                },
                {
                  id: "openai/gpt-4o",
                  name: "Paid GPT-4o",
                  pricing: { prompt: "0.0025", completion: "0.01" },
                },
              ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.endsWith("/chat/completions")) {
          const body = JSON.parse(String(init?.body));
          const input = JSON.parse(body.messages[1].content);
          const content = input.check
            ? { ok: true }
            : { summary: "Summary from API provider." };
          return new Response(
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: JSON.stringify(content),
                  },
                  finish_reason: "stop",
                },
              ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected URL: ${u}`);
      };

      let signedIn = false;
      const nativeCalls: any[] = [];
      (globalThis as any).__nativeCalls = nativeCalls;
      chrome.runtime.sendNativeMessage = (async (_host: string, msg: any) => {
        nativeCalls.push(msg);
        if (msg.type === "HELPER_STATUS") {
          return {
            id: msg.id,
            ok: true,
            value: {
              installed: true,
              version: "0.1.0",
              activeAccountId: signedIn ? "acct_e2e" : undefined,
              accounts: signedIn
                ? [
                    {
                      accountId: "acct_e2e",
                      email: "reader@example.com",
                      subject: "sub_e2e",
                      clientId: "client_e2e",
                      grantedScopes: ["chatgpt.tokens.use.direct"],
                      state: "ready",
                      updatedAt: Date.now(),
                    },
                  ]
                : [],
            },
          };
        }
        if (msg.type === "AUTH_SIGN_IN") {
          signedIn = true;
          return {
            id: msg.id,
            ok: true,
            value: {
              installed: true,
              version: "0.1.0",
              activeAccountId: "acct_e2e",
              accounts: [
                {
                  accountId: "acct_e2e",
                  email: "reader@example.com",
                  subject: "sub_e2e",
                  clientId: "client_e2e",
                  grantedScopes: ["chatgpt.tokens.use.direct"],
                  state: "ready",
                  updatedAt: Date.now(),
                },
              ],
            },
          };
        }
        if (msg.type === "MODELS_LIST") {
          return {
            id: msg.id,
            ok: true,
            value: [{ id: "gpt-5", label: "GPT-5 (gpt-5)" }],
          };
        }
        if (msg.type === "VERIFY_MODEL") {
          return { id: msg.id, ok: true, value: { verified: true } };
        }
        if (msg.type === "SUMMARIZE") {
          return {
            id: msg.id,
            ok: true,
            value: { summary: "Financial article summary from ChatGPT." },
          };
        }
        if (msg.type === "EXPLAIN") {
          return {
            id: msg.id,
            ok: true,
            value: {
              word: msg.selection.text,
              language: "en",
              explanation: "Headwinds explained via ChatGPT account.",
              turkishEquivalent: "ChatGPT üzerinden olumsuz koşullar",
            },
          };
        }
        if (msg.type === "AUTH_SIGN_OUT") {
          signedIn = false;
          return {
            id: msg.id,
            ok: true,
            value: { installed: true, version: "0.1.0", accounts: [] },
          };
        }
        throw new Error("Unexpected native message");
      }) as typeof chrome.runtime.sendNativeMessage;
    });

    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);

    // 1. Configure Gemini
    await options.locator("#provider").selectOption("gemini");
    await expect(options.locator("#api-key-label")).toContainText(
      "Google Gemini API anahtarı",
    );
    await options.locator("#api-key").fill("AIzaSyTestKeyNotReal");
    await options.locator("#load-models").click();
    await expect(options.locator("#status")).toContainText("Modeller alındı");
    await expect(options.locator("#model option")).toHaveText([
      "gemini-2.5-flash (Gemini 2.5 Flash)",
    ]);
    await options.locator("#save").click();
    await expect(options.locator("#status")).toContainText("Bağlantı hazır");

    // 2. Configure OpenRouter Free Models (paid model filtered out)
    await options.locator("#provider").selectOption("openrouter");
    await expect(options.locator("#api-key-label")).toContainText(
      "OpenRouter API anahtarı",
    );
    await options.locator("#api-key").fill("sk-or-v1-test-free-key");
    await options.locator("#load-models").click();
    await expect(options.locator("#status")).toContainText(
      "Ücretsiz OpenRouter modelleri alındı",
    );
    await expect(options.locator("#model option")).toHaveText([
      "openrouter/free (OpenRouter Free Router)",
    ]);
    await options.locator("#save").click();
    await expect(options.locator("#status")).toContainText("Bağlantı hazır");

    // 3. Configure ChatGPT via local helper
    await options.locator("#provider").selectOption("chatgpt");
    await expect(options.locator("#chatgpt-panel")).toBeVisible();
    await options.locator("#chatgpt-signin").click();
    await expect(options.locator("#chatgpt-helper-state")).toContainText(
      "reader@example.com",
    );
    await options.locator("#chatgpt-load-models").click();
    await expect(options.locator("#chatgpt-model option")).toHaveText([
      "GPT-5 (gpt-5)",
    ]);
    await options.locator("#chatgpt-save").click();
    await expect(options.locator("#status")).toContainText(
      "ChatGPT bağlantısı hazır",
    );

    const page = await context.newPage();
    await context.route("http://manasi.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta charset="utf-8"><title>Market report</title></head><body style="font:20px Georgia;padding:60px"><main><h1>Market report</h1><p id="en">The company faces significant headwinds.</p></main></body></html>',
      }),
    );
    await page.goto("http://manasi.test/article");
    await page.bringToFront();

    const cdp = await context.browser()!.newBrowserCDPSession();
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }],
    });
    const targetInfo = targetInfos.find((t) => t.url === page.url())!;
    await cdp.send("Extensions.triggerAction", {
      id,
      targetId: targetInfo.targetId,
    });
    const invokedTab = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url === "http://manasi.test/article")!;
    });

    const popup = await context.newPage();
    await popup.addInitScript((tab) => {
      chrome.tabs.query = (async () => [tab]) as typeof chrome.tabs.query;
    }, invokedTab);
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.locator("#provider-badge")).toContainText("CHATGPT");
    await popup.locator("#start").click();
    await expect(popup.locator("#status")).toContainText("Bağlam hazır");
    await popup.close();

    await page.evaluate(() => {
      const node = document.querySelector("#en")!.firstChild!;
      const start = node.textContent!.indexOf("headwinds");
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + "headwinds".length);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document
        .querySelector("#en")!
        .dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    await expect(page.locator("[data-manasi-root]")).toContainText(
      "Headwinds explained via ChatGPT account.",
    );

    await options.bringToFront();
    await options.locator("#chatgpt-signout").click();
    await expect(options.locator("#status")).toContainText(
      "ChatGPT oturumu kapatıldı",
    );
  } finally {
    await context.close();
  }
});

