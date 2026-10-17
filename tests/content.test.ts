import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { showCard, hideCard } from "../src/content/card";
import { watchPage } from "../src/content/watch";
import { ContentSession } from "../src/content/session";
import { extractPage } from "../src/context/extract";
let cleanup: (() => void)[] = [];
beforeEach(() => {
  document.body.innerHTML =
    "<main><p>Yüz kişi.</p><p>Bir yüz gördüm.</p></main>";
});
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
  hideCard();
  vi.useRealTimers();
});
const rect = {
  left: 20,
  bottom: 40,
  top: 20,
  right: 50,
  width: 30,
  height: 20,
} as DOMRect;
it("renders HTML-like model text without creating executable elements", () => {
  showCard(rect, {
    meaning: {
      word: "yüz",
      language: "tr",
      explanation: "<img src=x onerror=alert(1)>",
    },
  });
  const root = document.querySelector("[data-manasi-root]")!.shadowRoot!;
  expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(root.querySelector("img")).toBeNull();
});
it("ignores own UI mutations and detects real content changes", async () => {
  vi.useFakeTimers();
  const invalid = vi.fn();
  cleanup.push(watchPage(invalid));
  showCard(rect, { loading: true });
  await vi.advanceTimersByTimeAsync(800);
  expect(invalid).not.toHaveBeenCalled();
  document.querySelector("p")!.style.color = "red";
  await vi.advanceTimersByTimeAsync(800);
  expect(invalid).not.toHaveBeenCalled();
  document.querySelector("p")!.textContent = "Başka bağlam";
  await vi.advanceTimersByTimeAsync(800);
  expect(invalid).toHaveBeenCalledOnce();
});
it("invalidates SPA URL changes", async () => {
  vi.useFakeTimers();
  const invalid = vi.fn();
  cleanup.push(watchPage(invalid));
  history.pushState(null, "", "/changed");
  await vi.advanceTimersByTimeAsync(1100);
  expect(invalid).toHaveBeenCalledOnce();
  history.replaceState(null, "", "/");
});
function select(index: number, start: number, end: number) {
  const range = document.createRange();
  range.setStart(document.querySelectorAll("p")[index].firstChild!, start);
  range.setEnd(document.querySelectorAll("p")[index].firstChild!, end);
  Object.defineProperty(range, "getBoundingClientRect", { value: () => rect });
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}
it("sends the actual selected occurrence and ignores a late previous response", async () => {
  const pending: ((v: any) => void)[] = [];
  const sent: any[] = [];
  const session = new ContentSession(async (message) => {
    sent.push(message);
    return new Promise((r) => pending.push(r));
  });
  cleanup.push(() => session.dispose());
  const page = extractPage(document);
  session.activate("g", page.url, page.version);
  select(0, 0, 3);
  const first = session.explainSelection();
  select(1, 4, 7);
  const second = session.explainSelection();
  expect(sent[1].selection).toMatchObject({
    text: "yüz",
    paragraphIndex: 1,
    startOffset: 4,
  });
  pending[1]({
    ok: true,
    value: { word: "yüz", language: "tr", explanation: "Başın ön bölümü." },
  });
  await second;
  pending[0]({
    ok: true,
    value: { word: "Yüz", language: "tr", explanation: "Sayı." },
  });
  await first;
  expect(
    document.querySelector("[data-manasi-root]")!.shadowRoot!.textContent,
  ).toContain("Başın ön bölümü.");
  expect(
    document.querySelector("[data-manasi-root]")!.shadowRoot!.textContent,
  ).not.toContain("Sayı.");
});
it("rejects long selections before a network request and rejects activation of changed context", async () => {
  const send = vi.fn();
  const session = new ContentSession(send);
  cleanup.push(() => session.dispose());
  const page = extractPage(document);
  expect(() => session.activate("g", page.url, "old")).toThrow();
  session.activate("g", page.url, page.version);
  document.querySelector("p")!.textContent = "a".repeat(201);
  select(0, 0, 201);
  await session.explainSelection();
  expect(send).not.toHaveBeenCalled();
});
it("closing or stopping the card prevents a pending response reopening it", async () => {
  let done!: (v: any) => void;
  const session = new ContentSession(() => new Promise((r) => (done = r)));
  cleanup.push(() => session.dispose());
  const p = extractPage(document);
  session.activate("g", p.url, p.version);
  select(1, 4, 7);
  const work = session.explainSelection();
  document
    .querySelector("[data-manasi-root]")!
    .shadowRoot!.querySelector<HTMLButtonElement>("button")!
    .click();
  done({
    ok: true,
    value: { word: "yüz", language: "tr", explanation: "late" },
  });
  await work;
  expect(document.querySelector("[data-manasi-root]")).toBeNull();
});
