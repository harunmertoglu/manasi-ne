import { beforeEach, expect, it } from "vitest";
import { extractPage } from "../src/context/extract";
import { chunkText } from "../src/context/chunks";
import { resolveSelection } from "../src/context/selection";
import { cacheKey } from "../src/context/cache";
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
