import { request } from "./shared/messages";
import type { PageState, ProviderId, SettingsStatus } from "./shared/types";
const start = document.querySelector<HTMLButtonElement>("#start")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const status = document.querySelector<HTMLElement>("#status")!;
const badge = document.querySelector<HTMLElement>("#provider-badge");
const note = document.querySelector<HTMLElement>("#provider-note");
let tabId: number | undefined,
  busy = false,
  configured = false;
let actionError: string | null = null;

const POPUP_PROVIDER_META: Record<
  ProviderId,
  { badge: string; note: string }
> = {
  groq: {
    badge: "GROQ · KENDİ ANAHTARINLA",
    note: "Bu sayfanın metni, kendi API anahtarınız kullanılarak Groq'a gönderilir.",
  },
  gemini: {
    badge: "GEMINI · KENDİ ANAHTARINLA",
    note: "Bu sayfanın metni, kendi API anahtarınız kullanılarak Google Gemini API'ye gönderilir.",
  },
  openrouter: {
    badge: "OPENROUTER · ÜCRETSİZ MODEL",
    note: "Bu sayfanın metni, kendi API anahtarınızla OpenRouter ücretsiz modeline gönderilir.",
  },
  chatgpt: {
    badge: "CHATGPT · HESABINLA",
    note: "Bu sayfanın metni, kendi ChatGPT hesabın üzerinden OpenAI'a gönderilir.",
  },
};

function showState(state: PageState | null) {
  start.disabled =
    busy || !configured || !tabId || state?.status === "preparing";
  stop.hidden = !state;
  stop.disabled = busy;
  start.firstChild!.textContent = state
    ? "Bu sayfada yeniden başlat "
    : "Bu sayfada başlat ";
  if (actionError) {
    status.dataset.error = "true";
    status.textContent = actionError;
    return;
  }
  if (!configured) {
    status.textContent =
      "Başlamak için Ayarlar’dan bir sağlayıcı (Groq, Gemini, OpenRouter veya ChatGPT) bağla.";
    return;
  }
  status.dataset.error = String(state?.status === "error");
  status.textContent = !state
    ? "Hazır olduğunda sayfayı başlat."
    : state.status === "preparing"
      ? `Sayfa okunuyor… ${state.progress ?? ""}`
      : state.status === "ready"
        ? "Bağlam hazır. Şimdi metinden bir kelime seç."
        : (state.error ?? "Sayfa değişti. Yeniden başlat.");
}
async function refresh() {
  if (tabId === undefined) return;
  const settings = await request<Partial<SettingsStatus>>({
    type: "SETTINGS_STATUS",
  });
  configured = Boolean(settings.configured);
  const provider: ProviderId = settings.provider ?? "groq";
  const meta = POPUP_PROVIDER_META[provider] ?? POPUP_PROVIDER_META.groq;
  if (badge) badge.textContent = meta.badge;
  if (note) note.textContent = meta.note;
  showState(await request<PageState | null>({ type: "STATUS", tabId }));
}
function showError(error: unknown) {
  status.dataset.error = "true";
  actionError =
    error instanceof Error
      ? error.message
      : "İşlem tamamlanamadı. Yeniden deneyin.";
  status.textContent = actionError;
}
start.addEventListener(
  "click",
  () =>
    void (async () => {
      if (tabId === undefined || busy) return;
      actionError = null;
      busy = true;
      start.disabled = true;
      status.dataset.error = "false";
      status.textContent = "Sayfa hazırlanıyor…";
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        await request({ type: "START", tabId });
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
        await refresh().catch(showError);
      }
    })(),
);
stop.addEventListener(
  "click",
  () =>
    void (async () => {
      if (tabId === undefined || busy) return;
      actionError = null;
      busy = true;
      try {
        await request({ type: "STOP", tabId });
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
        await refresh().catch(showError);
      }
    })(),
);
document
  .querySelector("#options")!
  .addEventListener("click", () => void chrome.runtime.openOptionsPage());
void (async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    tabId = tab?.id;
    if (tabId === undefined) throw new Error("Aktif sekme bulunamadı.");
    await refresh();
  } catch (error) {
    showError(error);
  }
})();
const polling = setInterval(() => {
  if (!busy) void refresh().catch(showError);
}, 1000);
window.addEventListener("pagehide", () => clearInterval(polling));
