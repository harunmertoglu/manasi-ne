import { expect, it, vi } from "vitest";
import { PageController } from "../src/background/controller";
import { memoryArea } from "./helpers/chrome";
const page = {
  url: "https://example.com/",
  title: "Page",
  paragraphs: ["Bir yüz gördüm."],
  version: "v",
};
const selection = {
  text: "yüz",
  paragraphIndex: 0,
  startOffset: 4,
  surrounding: page.paragraphs,
};
const meaning = {
  word: "yüz",
  language: "tr" as const,
  explanation: "Başın ön bölümü.",
};
function setup(
  client = {
    summarize: async (_text: string) => "Topic",
    explain: async (..._args: any[]) => meaning,
  },
) {
  const area = memoryArea();
  const controller = new PageController(
    area,
    async () => ({ apiKey: "key", model: "m", validated: true }),
    () => client,
  );
  return { area, controller, client };
}
async function ready(c: PageController) {
  await vi.waitFor(async () =>
    expect((await c.status(1))?.status).toBe("ready"),
  );
  return (await c.status(1))!;
}
it("prepares all chunks in order before ready, preserving original page context", async () => {
  const inputs: string[] = [];
  let finish!: () => void;
  const gate = new Promise<void>((r) => (finish = r));
  const { controller } = setup({
    summarize: async (text) => {
      inputs.push(text);
      if (inputs.length === 1) await gate;
      return "S" + inputs.length;
    },
    explain: async () => meaning,
  });
  const result = await controller.start(1, {
    ...page,
    paragraphs: ["a".repeat(12001)],
  });
  expect(result.ok).toBe(true);
  expect((await controller.status(1))?.status).toBe("preparing");
  finish();
  await ready(controller);
  expect(inputs.map((s) => s.length)).toEqual([12000, 1, 5]);
  expect((await controller.status(1))?.page.paragraphs[0]).toHaveLength(12001);
});
it("rejects oversized pages instead of marking an incomplete page ready", async () => {
  const { controller } = setup();
  expect(
    await controller.start(1, { ...page, paragraphs: ["a".repeat(120001)] }),
  ).toMatchObject({ ok: false, code: "page_too_large" });
  expect(await controller.status(1)).toBeNull();
});
it("does not resurrect a stopped page when its summary completes late", async () => {
  let finish!: (s: string) => void;
  const gate = new Promise<string>((r) => (finish = r));
  const { controller } = setup({
    summarize: () => gate,
    explain: async () => meaning,
  });
  await controller.start(1, page);
  await controller.stop(1);
  finish("late");
  await new Promise((r) => setTimeout(r, 10));
  expect(await controller.status(1)).toBeNull();
});
it("deduplicates requests and caches by actual usage", async () => {
  let calls = 0;
  const { controller } = setup({
    summarize: async () => "topic",
    explain: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return meaning;
    },
  });
  await controller.start(1, page);
  const state = await ready(controller);
  const results = await Promise.all([
    controller.explain(1, state.generation, selection),
    controller.explain(1, state.generation, selection),
  ]);
  expect(results[0]).toMatchObject({ ok: true, value: meaning });
  expect(calls).toBe(1);
  await controller.explain(1, state.generation, selection);
  expect(calls).toBe(1);
});
it("bounds the cache to the most recent 100 explanations", async () => {
  const { controller, area } = setup();
  await controller.start(1, { ...page, paragraphs: ["yüz ".repeat(110)] });
  const s = await ready(controller);
  for (let i = 0; i < 105; i++)
    await controller.explain(1, s.generation, {
      ...selection,
      startOffset: i * 4,
      surrounding: ["yüz ".repeat(110)],
    });
  expect(area.data["page:1"].cache).toHaveLength(100);
});
it("rejects old generations and results arriving after invalidation", async () => {
  let finish!: (v: typeof meaning) => void;
  const { controller } = setup({
    summarize: async () => "topic",
    explain: () => new Promise((r) => (finish = r)),
  });
  await controller.start(1, page);
  const s = await ready(controller);
  const pending = controller.explain(1, s.generation, selection);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await controller.invalidate(1);
  finish(meaning);
  expect(await pending).toMatchObject({ ok: false, code: "stale_context" });
  expect((await controller.status(1))?.status).toBe("stale");
  expect(await controller.explain(1, "old", selection)).toMatchObject({
    ok: false,
  });
});
it("recovers interrupted preparation after worker restart", async () => {
  const { controller, area } = setup({
    summarize: () => new Promise(() => {}),
    explain: async () => meaning,
  });
  await controller.start(1, page);
  const restarted = new PageController(
    area,
    async () => ({ apiKey: "k", model: "m", validated: true }),
    () => ({ summarize: async () => "", explain: async () => meaning }),
  );
  await restarted.recover();
  expect((await restarted.status(1))?.status).toBe("error");
});
it("reports provider failure without getting stuck preparing", async () => {
  const { controller } = setup({
    summarize: async () => {
      throw new Error("sensitive error");
    },
    explain: async () => meaning,
  });
  await controller.start(1, page);
  await vi.waitFor(async () =>
    expect((await controller.status(1))?.status).toBe("error"),
  );
  expect((await controller.status(1))?.error).not.toContain("sensitive");
});
