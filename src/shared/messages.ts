import { AppError, type SelectionContext, type PageContent } from "./types";
type Sender = {
  id?: string;
  url?: string;
  tab?: { id?: number };
  frameId?: number;
};
export type Message =
  | { type: "START" | "STOP" | "STATUS"; tabId: number }
  | { type: "SETTINGS_STATUS" | "CLEAR_SETTINGS" }
  | { type: "LIST_MODELS"; apiKey: string }
  | { type: "SAVE_SETTINGS"; apiKey: string; model: string }
  | { type: "INVALIDATE"; generation: string }
  | { type: "EXPLAIN"; generation: string; selection: SelectionContext };
const bad = () => {
  throw new AppError(
    "invalid_message",
    "Bu işlem için geçerli eklenti isteği gerekiyor.",
  );
};
function str(value: unknown, max: number, empty = false): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    (empty || value.trim().length > 0)
  );
}
export function authorizeMessage(
  raw: unknown,
  sender: Sender,
  id: string,
): Message {
  if (sender.id !== id || !raw || typeof raw !== "object") return bad();
  const m = raw as Record<string, any>;
  const options = sender.url === `chrome-extension://${id}/options.html`;
  const popup = sender.url === `chrome-extension://${id}/popup.html`;
  const content =
    !!sender.tab &&
    Number.isInteger(sender.tab.id) &&
    sender.frameId === 0 &&
    /^https?:\/\//.test(sender.url ?? "");
  switch (m.type) {
    case "SAVE_SETTINGS":
      if (!options || !str(m.apiKey, 1024, true) || !str(m.model, 200))
        return bad();
      return { type: m.type, apiKey: m.apiKey.trim(), model: m.model };
    case "LIST_MODELS":
      if (!options || !str(m.apiKey, 1024, true)) return bad();
      return { type: m.type, apiKey: m.apiKey.trim() };
    case "CLEAR_SETTINGS":
      if (!options) return bad();
      return { type: m.type };
    case "SETTINGS_STATUS":
      if (!options && !popup) return bad();
      return { type: m.type };
    case "START":
    case "STOP":
    case "STATUS":
      if (!popup || !Number.isInteger(m.tabId) || m.tabId < 0) return bad();
      return { type: m.type, tabId: m.tabId };
    case "INVALIDATE":
      if (!content || !str(m.generation, 100)) return bad();
      return { type: m.type, generation: m.generation };
    case "EXPLAIN": {
      const s = m.selection;
      if (
        !content ||
        !str(m.generation, 100) ||
        !s ||
        !str(s.text, 200) ||
        !Number.isInteger(s.paragraphIndex) ||
        s.paragraphIndex < 0 ||
        !Number.isInteger(s.startOffset) ||
        s.startOffset < 0 ||
        !Array.isArray(s.surrounding) ||
        s.surrounding.length < 1 ||
        s.surrounding.length > 3 ||
        !s.surrounding.every((p: unknown) => str(p, 12000))
      )
        return bad();
      return {
        type: m.type,
        generation: m.generation,
        selection: {
          text: s.text,
          paragraphIndex: s.paragraphIndex,
          startOffset: s.startOffset,
          surrounding: s.surrounding,
        },
      };
    }
    default:
      return bad();
  }
}
export function validatePage(raw: unknown): PageContent {
  if (!raw || typeof raw !== "object") return bad();
  const p = raw as Record<string, any>;
  if (
    !str(p.url, 8192) ||
    !str(p.title, 2000, true) ||
    !str(p.version, 100) ||
    !Array.isArray(p.paragraphs) ||
    !p.paragraphs.length ||
    p.paragraphs.length > 50000 ||
    !p.paragraphs.every((v: unknown) => str(v, 120001))
  )
    return bad();
  if (p.paragraphs.join("\n").length > 120000)
    throw new AppError(
      "page_too_large",
      "Sayfa 120.000 karakter sınırını aşıyor. Daha kısa bir sayfa deneyin.",
    );
  return {
    url: p.url,
    title: p.title,
    paragraphs: p.paragraphs,
    version: p.version,
  };
}
export async function request<T>(message: Message): Promise<T> {
  const result = await chrome.runtime.sendMessage(message);
  if (!result || !result.ok)
    throw new AppError(
      result?.code ?? "connection",
      result?.message ?? "Eklenti bağlantısı kesildi. Sayfayı yenileyin.",
    );
  return result.value as T;
}
