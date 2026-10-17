import { beforeEach, expect, it } from "vitest";
import { cacheKey } from "../src/context/cache";
import { chunkText } from "../src/context/chunks";
import { extractPage } from "../src/context/extract";
import { resolveSelection } from "../src/context/selection";
beforeEach(() => {
  document.body.innerHTML = "";
});
it("extracts all articles without menus, private forms, scripts or duplicate nested text", () => {
  document.body.innerHTML =
    '<nav>Menu</nav><main><h1>Başlık</h1><article><p>Bir <b>yüz</b> gördüm.</p><form>secret<input value="private"></form><script>secret</script></article><article><p>Yüz kişi geldi.</p></article></main><div data-manasi-root>card</div>';
  expect(extractPage(document).paragraphs).toEqual([
    "Başlık",
    "Bir yüz gördüm.",
    "Yüz kişi geldi.",
  ]);
});
it("ignores hidden and editable content and rejects empty/navigation pages", () => {
  document.body.innerHTML =
    '<nav>Menu</nav><div hidden>hidden</div><div contenteditable="true">private</div>';
  expect(() => extractPage(document)).toThrow();
});
it("reads div-only pages in DOM order without duplicating inline children", () => {
  document.body.innerHTML =
    "<main>Önce <b>bu.</b><div>Sonra <span>şu.</span></div> En son.</main>";
  expect(extractPage(document).paragraphs).toEqual([
    "Önce bu.",
    "Sonra şu.",
    "En son.",
  ]);
});
it("resolves the actual second occurrence and derives a different cache key", () => {
  document.body.innerHTML =
    "<main><p>Yüz kişi.</p><p>Bir yüz gördüm.</p></main>";
  const range = document.createRange();
  const node = document.querySelectorAll("p")[1].firstChild!;
  range.setStart(node, 4);
  range.setEnd(node, 7);
  const selection = resolveSelection(range, document);
  expect(selection).toMatchObject({
    text: "yüz",
    paragraphIndex: 1,
    startOffset: 4,
    surrounding: ["Yüz kişi.", "Bir yüz gördüm."],
  });
  const page = extractPage(document);
  expect(cacheKey(page, selection, "m")).not.toBe(
    cacheKey(page, { ...selection, paragraphIndex: 0, startOffset: 0 }, "m"),
  );
  expect(cacheKey(page, selection, "m", "groq")).not.toBe(
    cacheKey(page, selection, "m", "gemini"),
  );
  expect(cacheKey(page, selection, "m", "openrouter")).not.toBe(
    cacheKey(page, selection, "m", "chatgpt", "acct_1"),
  );
  expect(cacheKey(page, selection, "m", "chatgpt", "acct_1")).not.toBe(
    cacheKey(page, selection, "m", "chatgpt", "acct_2"),
  );
});
it("rejects selections outside the main content and longer than 200 characters", () => {
  document.body.innerHTML =
    "<nav>Menu</nav><main><p>" + "a".repeat(201) + "</p></main>";
  const r = document.createRange();
  r.selectNodeContents(document.querySelector("nav")!);
  expect(() => resolveSelection(r, document)).toThrow();
  r.selectNodeContents(document.querySelector("p")!);
  expect(() => resolveSelection(r, document)).toThrow();
});
it("splits a long paragraph without loss and accepts exactly 120000 characters", () => {
  expect(chunkText(["a".repeat(12001)]).map((s) => s.length)).toEqual([
    12000, 1,
  ]);
  expect(chunkText(["a".repeat(120000)])).toHaveLength(10);
  expect(() => chunkText(["a".repeat(120001)])).toThrow();
});

it.each([
  '<div contenteditable="true"><article><p>Private draft</p></article></div>',
  "<div hidden><main><p>Private hidden content</p></main></div>",
  '<div style="display:none"><main><p>Private hidden content</p></main></div>',
  "<form><article><p>Private form text</p></article></form>",
  "<nav><article>Only navigation links</article></nav>",
])("never extracts semantic roots inside excluded ancestors: %s", (html) => {
  document.body.innerHTML = html;
  expect(() => extractPage(document)).toThrow();
});
it("falls back to visible articles when all main roots are excluded", () => {
  document.body.innerHTML =
    "<div hidden><main>Secret</main></div><article><p>Public article.</p></article>";
  expect(extractPage(document).paragraphs).toEqual(["Public article."]);
});
