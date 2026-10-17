// @vitest-environment node
import { expect, it } from "vitest";
import { OpenAIChatGPTClient } from "../helper/openai";

function sseResponse(jsonPayload: unknown): Response {
  const text = JSON.stringify(jsonPayload);
  const body =
    `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: text })}\n\n` +
    `event: response.completed\ndata: ${JSON.stringify({ response: { status: "completed" } })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

it("lists only models with visibility === list and maps slug and display_name", async () => {
  const client = new OpenAIChatGPTClient(
    async () => ({ accountId: "acct_1", accessToken: "tok_1" }),
    async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              slug: "gpt-5",
              display_name: "GPT-5",
              visibility: "list",
              supported_in_api: true,
            },
            {
              slug: "hidden-internal",
              display_name: "Hidden",
              visibility: "hidden",
              supported_in_api: true,
            },
          ],
        }),
      ),
  );
  await expect(client.listModels("acct_1")).resolves.toEqual([
    { id: "gpt-5", label: "GPT-5 (gpt-5)" },
  ]);
});

it("sends store:false, stream:true without temperature or max_output_tokens and retries once on 401", async () => {
  let tokenCalls = 0;
  let capturedBody: Record<string, unknown> = {};
  let apiAttempts = 0;

  const client = new OpenAIChatGPTClient(
    async (_accountId, forceRefresh) => {
      tokenCalls++;
      return {
        accountId: "acct_1",
        accessToken: forceRefresh ? "fresh_token" : "stale_token",
      };
    },
    async (_url, init) => {
      apiAttempts++;
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "Bearer stale_token") {
        return new Response("unauthorized", { status: 401 });
      }
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sseResponse({
        word: "headwinds",
        language: "en",
        explanation: "Conditions hindering progress.",
        turkishEquivalent: "Olumsuz koşullar",
      });
    },
  );

  const meaning = await client.explain("acct_1", "gpt-5", "Financial report", {
    text: "headwinds",
    paragraphIndex: 0,
    startOffset: 18,
    surrounding: ["The company faces headwinds."],
  });

  expect(tokenCalls).toBe(2);
  expect(apiAttempts).toBe(2);
  expect(capturedBody.store).toBe(false);
  expect(capturedBody.stream).toBe(true);
  expect(capturedBody.model).toBe("gpt-5");
  expect("temperature" in capturedBody).toBe(false);
  expect("max_output_tokens" in capturedBody).toBe(false);
  expect(meaning.turkishEquivalent).toBe("Olumsuz koşullar");
});
