import { ChatGPTBridgeError, ChatGPTNativeBridge } from "../chatgpt/bridge";
import { ChatGPTClient } from "../chatgpt/client";
import { GroqClient } from "../groq/client";
import { authorizeMessage, validatePage } from "../shared/messages";
import { AppError, failure, type Settings } from "../shared/types";
import { PageController } from "./controller";
import { SettingsStore } from "./settings";

const chatGptBridge = new ChatGPTNativeBridge();
const settings = new SettingsStore(
  chrome.storage.local,
  (s) => new GroqClient(s),
  (s) => new ChatGPTClient(s, chatGptBridge),
);
// Only keep a worker alive while a user-initiated API operation is pending.
async function activeRequest<T>(run: () => Promise<T>): Promise<T> {
  const heartbeat = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20000);
  try {
    return await run();
  } finally {
    clearInterval(heartbeat);
  }
}
async function wrapBridge<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await activeRequest(run);
  } catch (error) {
    if (error instanceof ChatGPTBridgeError) {
      throw new AppError(error.code, error.message);
    }
    throw error;
  }
}
const client = (s: Settings) => {
  const impl =
    s.provider === "chatgpt"
      ? new ChatGPTClient(s, chatGptBridge)
      : new GroqClient(s);
  return {
    summarize: (text: string) => activeRequest(() => impl.summarize(text)),
    explain: (...args: Parameters<GroqClient["explain"]>) =>
      activeRequest(() => impl.explain(...args)),
  };
};
const controller = new PageController(
  chrome.storage.session,
  () => settings.getSettings(),
  client,
  async (state) => {
    const response = await chrome.tabs.sendMessage(state.tabId, {
      type: "ACTIVATE",
      generation: state.generation,
      url: state.page.url,
      version: state.page.version,
    });
    if (!response?.ok) await controller.invalidate(state.tabId);
  },
);
const initialized = (async () => {
  await settings.initialize();
  await chrome.storage.session.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await controller.recover();
})();
async function deactivate(tabId: number) {
  await chrome.tabs.sendMessage(tabId, { type: "DEACTIVATE" }).catch(() => {});
}
async function clearAll() {
  for (const tabId of await controller.stopAll()) await deactivate(tabId);
}
async function handle(raw: unknown, sender: chrome.runtime.MessageSender) {
  const message = authorizeMessage(raw, sender, chrome.runtime.id);
  // Cancellation order follows message arrival, including initialization and
  // asynchronous tab reads, rather than whichever request finishes first.
  const generation =
    message.type === "START" || message.type === "STOP"
      ? controller.reserveStart(message.tabId)
      : undefined;
  const clearing =
    message.type === "CLEAR_SETTINGS" || message.type === "CHATGPT_SIGN_OUT"
      ? controller.stopAll()
      : undefined;
  await initialized;
  switch (message.type) {
    case "SETTINGS_STATUS":
      return { ok: true, value: await settings.getStatus() };
    case "LIST_MODELS": {
      const provider = message.provider ?? "groq";
      const saved = await settings.getSavedApiKeySettings(provider);
      const apiKey = message.apiKey || saved?.apiKey;
      if (!apiKey)
        throw new AppError("missing_key", "Önce kendi API anahtarınızı girin.");
      return {
        ok: true,
        value: await activeRequest(() =>
          new GroqClient({
            provider,
            apiKey,
            model: "",
            validated: false,
          }).listModels(),
        ),
      };
    }
    case "SAVE_SETTINGS": {
      const provider = message.provider ?? "groq";
      await activeRequest(() =>
        settings.validateAndSaveApiKeySettings(
          provider,
          message.apiKey,
          message.model,
        ),
      );
      await clearAll();
      return { ok: true, value: null };
    }
    case "CLEAR_SETTINGS":
      await settings.clearApiKeySettings(message.provider);
      for (const tabId of await clearing!) await deactivate(tabId);
      return { ok: true, value: null };
    case "SELECT_PROVIDER": {
      const before = await settings.getSettings();
      const after = await settings.selectProvider(message.provider);
      if (
        before?.provider !== after?.provider ||
        before?.model !== after?.model
      ) {
        await clearAll();
      }
      return { ok: true, value: await settings.getStatus() };
    }
    case "CHATGPT_HELPER_STATUS":
      return { ok: true, value: await wrapBridge(() => chatGptBridge.status()) };
    case "CHATGPT_SIGN_IN":
      return { ok: true, value: await wrapBridge(() => chatGptBridge.signIn()) };
    case "CHATGPT_LIST_MODELS":
      return {
        ok: true,
        value: await wrapBridge(() =>
          chatGptBridge.listModels(message.accountId),
        ),
      };
    case "SAVE_CHATGPT_SETTINGS":
      await activeRequest(() =>
        settings.validateAndSaveChatGPTSettings(
          message.accountId,
          message.model,
        ),
      );
      await clearAll();
      return { ok: true, value: null };
    case "CHATGPT_SIGN_OUT": {
      const status = await wrapBridge(() =>
        chatGptBridge.signOut(message.accountId),
      );
      await settings.clearChatGPTSettings(message.accountId);
      for (const tabId of await clearing!) await deactivate(tabId);
      return { ok: true, value: status };
    }
    case "STATUS":
      return { ok: true, value: await controller.status(message.tabId) };
    case "START": {
      controller.assertCurrent(message.tabId, generation!);
      const tab = await chrome.tabs.get(message.tabId);
      controller.assertCurrent(message.tabId, generation!);
      if (
        !/^https?:\/\//.test(tab.url ?? "") ||
        /\.pdf(?:[?#]|$)/i.test(tab.url ?? "") ||
        /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(
          tab.url ?? "",
        )
      )
        throw new AppError(
          "restricted_page",
          "Bu sayfa desteklenmiyor. Normal bir web sayfasında deneyin.",
        );
      await deactivate(message.tabId);
      controller.assertCurrent(message.tabId, generation!);
      let response;
      try {
        response = await chrome.tabs.sendMessage(message.tabId, {
          type: "READ_PAGE",
        });
      } catch {
        throw new AppError(
          "page_unavailable",
          "Sayfa okunamadı. Sayfayı yenileyip yeniden deneyin.",
        );
      }
      controller.assertCurrent(message.tabId, generation!);
      if (!response?.ok)
        throw new AppError(
          response?.code ?? "empty_page",
          response?.message ?? "Sayfa metni okunamadı.",
        );
      const page = validatePage(response.value);
      if (page.url !== tab.url)
        throw new AppError("stale_context", "Sayfa değişti. Yeniden başlatın.");
      return await controller.start(message.tabId, page, generation);
    }
    case "STOP":
      if (await controller.stop(message.tabId, generation))
        await deactivate(message.tabId);
      return { ok: true, value: null };
    case "INVALIDATE": {
      const tabId = sender.tab!.id!;
      const current = await controller.status(tabId);
      if (current?.generation === message.generation)
        await controller.invalidate(tabId);
      return { ok: true, value: null };
    }
    case "EXPLAIN":
      return await controller.explain(
        sender.tab!.id!,
        message.generation,
        message.selection,
      );
  }
}
chrome.runtime.onMessage.addListener((raw, sender, respond) => {
  void handle(raw, sender)
    .then(respond)
    .catch((error) => respond(failure(error)));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void controller.stop(tabId).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" || change.url)
    void controller
      .stop(tabId)
      .then(async (stopped) => {
        if (stopped) await deactivate(tabId);
      })
      .catch(() => {});
});
