import { expect, it, vi } from "vitest";
import { GroqClient } from "../src/groq/client";
const settings = {
  apiKey: "private-key",
  model: "chosen-model",
  validated: true,
};
const page = {
  url: "https://example.com",
  title: "Markets",
  paragraphs: ["The company faces headwinds."],
  version: "v",
};
const selection = {
  text: "headwinds",
  paragraphIndex: 0,
  startOffset: 18,
  surrounding: page.paragraphs,
};
const completion = (content: string) =>
  new Response(
    JSON.stringify({
      id: "id",
      object: "chat.completion",
      created: 1,
      model: "chosen-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  );
it.each([401, 403, 429, 400, 500])(
  "maps HTTP %i without leaking server details",
  async (status) => {
    const client = new GroqClient(
      settings,
      vi.fn(async () => new Response("private-key secret page", { status })),
    );
    await expect(client.summarize("page")).rejects.toMatchObject({
      code:
        status === 401 || status === 403
          ? "invalid_key"
          : status === 429
            ? "rate_limit"
            : status === 400
              ? "unsupported_model"
              : "provider_error",
    });
    await expect(client.summarize("page")).rejects.not.toThrow("private-key");
  },
);
it("handles network failures with a safe error", async () => {
  await expect(
    new GroqClient(settings, async () => {
      throw new TypeError("network");
    }).summarize("x"),
  ).rejects.toMatchObject({ code: "network" });
});
it("passes actual context as user data and explains English with Turkish equivalent", async () => {
  let body: any;
  const client = new GroqClient(settings, async (_url, init) => {
    body = JSON.parse(init!.body as string);
    return completion(
      JSON.stringify({
        word: "headwinds",
        language: "en",
        explanation: "Conditions hindering progress.",
        turkishEquivalent: "Olumsuz koşullar",
      }),
    );
  });
  const value = await client.explain(page, "Financial report", selection);
  expect(value.turkishEquivalent).toBe("Olumsuz koşullar");
  expect(JSON.parse(body.messages[1].content)).toMatchObject({
    summary: "Financial report",
    selection: {
      text: "headwinds",
      surrounding: ["The company faces headwinds."],
    },
  });
  expect(body.messages[0].content).not.toContain("Financial report");
  expect(body.model).toBe("chosen-model");
});
it.each([
  "bad json",
  JSON.stringify({ word: "headwinds", language: "en", explanation: "Meaning" }),
])("rejects malformed explanations", async (content) => {
  await expect(
    new GroqClient(settings, async () => completion(content)).explain(
      page,
      "s",
      selection,
    ),
  ).rejects.toMatchObject({ code: "invalid_response" });
});
it("rejects unsupported languages", async () => {
  await expect(
    new GroqClient(settings, async () =>
      completion(
        JSON.stringify({ word: "bonjour", language: "fr", explanation: "x" }),
      ),
    ).explain(page, "s", selection),
  ).rejects.toMatchObject({ code: "unsupported_language" });
});
it("accepts Turkish explanation without translation", async () => {
  const value = await new GroqClient(settings, async () =>
    completion(
      JSON.stringify({
        word: "yüz",
        language: "tr",
        explanation: "Başın ön bölümü.",
      }),
    ),
  ).explain(page, "s", selection);
  expect(value).toEqual({
    word: "yüz",
    language: "tr",
    explanation: "Başın ön bölümü.",
  });
});
it("reads model list and verifies selected model before chat", async () => {
  const urls: string[] = [];
  const client = new GroqClient(settings, async (url) => {
    urls.push(String(url));
    return String(url).endsWith("/models")
      ? new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "chosen-model", object: "model", active: true }],
          }),
        )
      : completion('{"ok":true}');
  });
  await client.verify();
  expect(urls.map((u) => new URL(u).pathname)).toEqual([
    "/openai/v1/models",
    "/openai/v1/chat/completions",
  ]);
});

it("calls fetch without a GroqClient receiver, as required by the browser API", async () => {
  const browserFetch = async function (this: unknown) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation");
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [{ id: "text-model", object: "model", active: true }],
      }),
    );
  };
  await expect(
    new GroqClient(settings, browserFetch).listModels(),
  ).resolves.toEqual([{ id: "text-model" }]);
});
