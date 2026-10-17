import { request } from "./shared/messages";
import type { PageState } from "./shared/types";
const start = document.querySelector<HTMLButtonElement>("#start")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const status = document.querySelector<HTMLElement>("#status")!;
let tabId: number | undefined,
  busy = false,
  configured = false;
let actionError: string | null = null;
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
      "Başlamak için Ayarlar’dan kendi Groq API anahtarını bağla.";
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
  const settings = await request<{ configured: boolean }>({
    type: "SETTINGS_STATUS",
  });
  configured = settings.configured;
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
