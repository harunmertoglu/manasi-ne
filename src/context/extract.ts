import { AppError, type PageContent } from "../shared/types";
export const ROOT_ATTRIBUTE = "data-manasi-root";
const excluded =
  'nav,aside,header,footer,script,style,noscript,template,form,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="complementary"],[data-manasi-root],.advertisement,[data-ad]';
const blockTags =
  /^(ARTICLE|MAIN|SECTION|DIV|P|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|TABLE|TR|TD|TH|DL|DT|DD|FIGCAPTION)$/;
export const normalize = (s: string) => s.replace(/\s+/gu, " ").trim();
export function fingerprint(text: string): string {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
export type TextBlock = { element: Element; text: string; nodes: Text[] };
export function collectBlocks(doc: Document): TextBlock[] {
  const eligibleRoot = (el: Element) => {
    if (el.closest(excluded)) return false;
    for (
      let ancestor: Element | null = el;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = doc.defaultView?.getComputedStyle(ancestor);
      if (style?.display === "none" || style?.visibility === "hidden")
        return false;
    }
    return true;
  };
  const mains = [...doc.querySelectorAll('main,[role="main"]')].filter(
    eligibleRoot,
  );
  const candidates = mains.length
    ? mains
    : [...doc.querySelectorAll("article")].filter(eligibleRoot);
  const roots = (candidates.length ? candidates : [doc.body]).filter(
    (el, i, all) =>
      el && !all.some((other, j) => j !== i && other.contains(el)),
  );
  const blocks: TextBlock[] = [];
  let nodes: Text[] = [],
    owner: Element | null = null;
  const flush = () => {
    const text = normalize(nodes.map((n) => n.data).join(""));
    if (text && owner) blocks.push({ element: owner, text, nodes: [...nodes] });
    nodes = [];
  };
  const walk = (node: Node, parent: Element) => {
    if (node.nodeType === 3) {
      nodes.push(node as Text);
      owner ??= parent;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.matches(excluded)) return;
    const style = doc.defaultView?.getComputedStyle(el);
    if (style?.display === "none" || style?.visibility === "hidden") return;
    if (el.tagName === "BR") {
      flush();
      owner = parent;
      return;
    }
    const block = blockTags.test(el.tagName);
    if (block) {
      flush();
      owner = el;
    }
    for (const child of el.childNodes) walk(child, el);
    if (block) {
      flush();
      owner = parent;
    }
  };
  for (const root of roots) {
    owner = root;
    walk(root, root);
    flush();
  }
  return blocks;
}
export function extractPage(doc: Document): PageContent {
  const paragraphs = collectBlocks(doc).map((b) => b.text);
  if (!paragraphs.length)
    throw new AppError(
      "empty_page",
      "Bu sayfada okunabilir ana metin bulunamadı.",
    );
  return {
    url: doc.location?.href ?? "",
    title: doc.title,
    paragraphs,
    version: fingerprint(paragraphs.join("\n")),
  };
}
