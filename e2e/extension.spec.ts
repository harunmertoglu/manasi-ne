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
      globalThis.fetch = async (url, init) => {
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
