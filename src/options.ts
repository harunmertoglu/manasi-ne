import type { HelperStatusPayload } from "./shared/chatgpt";
import { isApiKeyProviderId, request } from "./shared/messages";
import type {
  ApiKeyProviderId,
  ModelOption,
  ProviderId,
  SettingsStatus,
} from "./shared/types";

const providerSelect = document.querySelector<HTMLSelectElement>("#provider")!;
const activeSummary = document.querySelector<HTMLElement>(
  "#active-provider-summary",
)!;
const groqPanel = document.querySelector<HTMLElement>("#groq-panel")!;
const chatgptPanel = document.querySelector<HTMLElement>("#chatgpt-panel")!;

const keyLabel = document.querySelector<HTMLElement>("#api-key-label")!;
const key = document.querySelector<HTMLInputElement>("#api-key")!;
const model = document.querySelector<HTMLSelectElement>("#model")!;
const modelHint = document.querySelector<HTMLElement>("#model-hint")!;
const providerLink = document.querySelector<HTMLAnchorElement>(
  "#provider-link",
)!;

const chatgptHelperState = document.querySelector<HTMLElement>(
  "#chatgpt-helper-state",
)!;
const chatgptInstallBox = document.querySelector<HTMLElement>(
  "#chatgpt-install-box",
)!;
const chatgptInstallCmd = document.querySelector<HTMLElement>(
  "#chatgpt-install-cmd",
)!;
const chatgptModel =
  document.querySelector<HTMLSelectElement>("#chatgpt-model")!;
const status = document.querySelector<HTMLElement>("#status")!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];

let currentAccountId: string | undefined;
let lastRenderedApiKeyProvider: ApiKeyProviderId = "groq";

const API_PROVIDER_UI: Record<
  ApiKeyProviderId,
  {
    name: string;
    keyLabel: string;
    placeholder: string;
    modelHint: string;
    linkHref: string;
    linkText: string;
  }
> = {
  groq: {
    name: "Groq",
    keyLabel: "Groq API anahtarı",
    placeholder: "gsk_…",
    modelHint:
      "Metin sohbeti ve JSON yanıtını destekleyen bir model seç. Uygunluğu kaydederken doğrulanır.",
    linkHref: "https://console.groq.com/keys",
    linkText: "Groq'tan API anahtarı al ↗",
  },
  gemini: {
    name: "Google Gemini",
    keyLabel: "Google Gemini API anahtarı",
    placeholder: "AIza…",
    modelHint:
      "Gemini metin modellerinden (ör. gemini-2.5-flash) birini seç. Uygunluğu kaydederken doğrulanır.",
    linkHref: "https://aistudio.google.com/app/apikey",
    linkText: "Google AI Studio'dan Gemini API anahtarı al ↗",
  },
  openrouter: {
    name: "OpenRouter",
    keyLabel: "OpenRouter API anahtarı",
    placeholder: "sk-or-v1-…",
    modelHint:
      "Yalnızca ücretsiz (:free ve openrouter/free) modeller listelenir ve çalıştırılır. Ücretli modeller engellenir.",
    linkHref: "https://openrouter.ai/settings/keys",
    linkText: "OpenRouter'dan API anahtarı al ↗",
  },
};

const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  groq: "Groq",
  gemini: "Google Gemini",
  openrouter: "OpenRouter (Ücretsiz)",
  chatgpt: "ChatGPT",
};

function showPanels(provider: ProviderId) {
  groqPanel.hidden = provider === "chatgpt";
  chatgptPanel.hidden = provider !== "chatgpt";
  if (isApiKeyProviderId(provider)) {
    const meta = API_PROVIDER_UI[provider];
    keyLabel.textContent = meta.keyLabel;
    key.placeholder = meta.placeholder;
    modelHint.textContent = meta.modelHint;
    providerLink.href = meta.linkHref;
    providerLink.textContent = meta.linkText;
    providerLink.hidden = false;
  } else {
    providerLink.hidden = true;
  }
}

async function run(action: () => Promise<void>) {
  buttons.forEach((b) => (b.disabled = true));
  providerSelect.disabled = true;
  status.dataset.error = "false";
  status.textContent = "İşlem sürüyor…";
  try {
    await action();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "İşlem tamamlanamadı.";
    status.dataset.error = "true";
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    providerSelect.disabled = false;
  }
}

async function refreshHelperStatus(savedChatGptModel?: string) {
  const extId = chrome.runtime?.id || "EKLENTI_KIMLIGI";
  chatgptInstallCmd.textContent = `npm run chatgpt:install -- --extension-id ${extId}`;

  const helper = await request<
    { installed: false; reason: string } | HelperStatusPayload
  >({ type: "CHATGPT_HELPER_STATUS" });

  if (!helper.installed) {
    currentAccountId = undefined;
    chatgptHelperState.textContent = helper.reason;
    chatgptInstallBox.hidden = false;
    return;
  }

  chatgptInstallBox.hidden = true;
  const active =
    helper.accounts.find((a) => a.accountId === helper.activeAccountId) ??
    helper.accounts[0];
  currentAccountId = active?.accountId;

  if (!active) {
    chatgptHelperState.textContent =
      "Yerel yardımcı hazır. Devam etmek için ChatGPT hesabınla giriş yap.";
    return;
  }
  const label = active.email || active.displayName || active.accountId;
  if (active.state === "ready") {
    chatgptHelperState.textContent = `Bağlı ChatGPT hesabı: ${label}`;
  } else if (active.state === "permission_required") {
    chatgptHelperState.textContent = `Hesap (${label}) için doğrudan kullanım izni eksik. Yeniden giriş yapın.`;
  } else {
    chatgptHelperState.textContent = `Hesap (${label}) oturumunun yenilenmesi gerekiyor. Yeniden giriş yapın.`;
  }
  if (savedChatGptModel && !chatgptModel.value) {
    chatgptModel.replaceChildren(
      new Option(savedChatGptModel, savedChatGptModel),
    );
  }
}

function updateApiKeyPanelFromStatus(
  provider: ApiKeyProviderId,
  saved: SettingsStatus,
  forceModelReset: boolean,
) {
  const providerStatus = saved[provider];
  document.querySelector("#saved")!.textContent = providerStatus.configured
    ? "Bir anahtar kayıtlı. Değiştirmeyeceksen bu alanı boş bırak."
    : "Anahtar yalnızca bu tarayıcıdaki eklentide saklanır.";
  if (forceModelReset) {
    if (providerStatus.model) {
      model.replaceChildren(
        new Option(providerStatus.model, providerStatus.model),
      );
    } else {
      model.replaceChildren(new Option("Önce modelleri getir", ""));
    }
  } else if (providerStatus.model && !model.value) {
    model.replaceChildren(
      new Option(providerStatus.model, providerStatus.model),
    );
  }
}

async function refresh(SyncSelectToSaved = true) {
  const saved = await request<SettingsStatus>({ type: "SETTINGS_STATUS" });
  if (SyncSelectToSaved) {
    providerSelect.value = saved.provider;
  }
  const selectedProvider = providerSelect.value as ProviderId;
  showPanels(selectedProvider);

  activeSummary.textContent = saved.configured
    ? `Aktif sağlayıcı: ${PROVIDER_DISPLAY_NAMES[saved.provider]} · Model: ${saved.model ?? "-"}`
    : "Henüz doğrulanmış bir aktif sağlayıcı yok.";

  if (isApiKeyProviderId(selectedProvider)) {
    const switchedProvider = lastRenderedApiKeyProvider !== selectedProvider;
    lastRenderedApiKeyProvider = selectedProvider;
    updateApiKeyPanelFromStatus(selectedProvider, saved, switchedProvider);
  }

  if (selectedProvider === "chatgpt" || saved.chatgpt.configured) {
    await refreshHelperStatus(saved.chatgpt.model);
  }
}

providerSelect.addEventListener("change", () => {
  const chosen = providerSelect.value as ProviderId;
  showPanels(chosen);
  void run(async () => {
    const next = await request<SettingsStatus>({
      type: "SELECT_PROVIDER",
      provider: chosen,
    });
    if (isApiKeyProviderId(chosen)) {
      const switched = lastRenderedApiKeyProvider !== chosen;
      lastRenderedApiKeyProvider = chosen;
      key.value = "";
      updateApiKeyPanelFromStatus(chosen, next, switched);
    }
    if (chosen === "chatgpt") {
      await refreshHelperStatus(next.chatgpt.model);
    }
    const chosenStatus = next[chosen];
    status.textContent = chosenStatus.configured
      ? `${PROVIDER_DISPLAY_NAMES[chosen]} aktif sağlayıcı olarak seçildi.`
      : `${PROVIDER_DISPLAY_NAMES[chosen]} seçildi. Kullanmak için bağlantıyı doğrulayıp kaydedin.`;
  });
});

document.querySelector("#load-models")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      const provider = isApiKeyProviderId(providerSelect.value)
        ? providerSelect.value
        : "groq";
      const models = await request<ModelOption[]>({
        type: "LIST_MODELS",
        provider,
        apiKey: key.value.trim(),
      });
      const previous = model.value;
      model.replaceChildren(
        ...models.map((m) => new Option(m.label ?? m.id, m.id)),
      );
      if (models.some((m) => m.id === previous)) model.value = previous;
      status.textContent =
        provider === "openrouter"
          ? "Ücretsiz OpenRouter modelleri alındı. Bir model seçip doğrula."
          : "Modeller alındı. Bir metin modeli seçip doğrula.";
    }),
);

document.querySelector("#settings-form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  void run(async () => {
    const provider = isApiKeyProviderId(providerSelect.value)
      ? providerSelect.value
      : "groq";
    await request({
      type: "SAVE_SETTINGS",
      provider,
      apiKey: key.value.trim(),
      model: model.value,
    });
    key.value = "";
    await refresh();
    status.textContent =
      "Bağlantı hazır. Bir web sayfasında eklentiyi açıp başlatabilirsin.";
  });
});

document.querySelector("#delete")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      const provider = isApiKeyProviderId(providerSelect.value)
        ? providerSelect.value
        : "groq";
      await request({ type: "CLEAR_SETTINGS", provider });
      key.value = "";
      model.replaceChildren(new Option("Önce modelleri getir", ""));
      await refresh(false);
      status.textContent = "Kayıtlı anahtar ve sayfa bağlamları silindi.";
    }),
);

document.querySelector("#chatgpt-signin")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      const helper = await request<HelperStatusPayload>({
        type: "CHATGPT_SIGN_IN",
      });
      currentAccountId = helper.activeAccountId;
      await refresh(false);
      status.textContent =
        "ChatGPT girişi tamamlandı. Şimdi modelleri getirip bir model seçin.";
    }),
);

document.querySelector("#chatgpt-load-models")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      const models = await request<ModelOption[]>({
        type: "CHATGPT_LIST_MODELS",
        accountId: currentAccountId,
      });
      const previous = chatgptModel.value;
      chatgptModel.replaceChildren(
        ...models.map((m) => new Option(m.label ?? m.id, m.id)),
      );
      if (models.some((m) => m.id === previous)) chatgptModel.value = previous;
      status.textContent =
        "ChatGPT modelleri alındı. Bir model seçip doğrulayın.";
    }),
);

document.querySelector("#chatgpt-save")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      if (!currentAccountId) {
        throw new Error("Önce ChatGPT ile giriş yapın.");
      }
      await request({
        type: "SAVE_CHATGPT_SETTINGS",
        accountId: currentAccountId,
        model: chatgptModel.value,
      });
      await refresh();
      status.textContent =
        "ChatGPT bağlantısı hazır. Bir web sayfasında eklentiyi açıp başlatabilirsin.";
    }),
);

document.querySelector("#chatgpt-signout")!.addEventListener(
  "click",
  () =>
    void run(async () => {
      await request({
        type: "CHATGPT_SIGN_OUT",
        accountId: currentAccountId,
      });
      currentAccountId = undefined;
      chatgptModel.replaceChildren(
        new Option("Önce ChatGPT ile giriş yapıp modelleri getir", ""),
      );
      await refresh();
      status.textContent =
        "ChatGPT oturumu kapatıldı ve yerel anahtar silindi.";
    }),
);

void refresh().catch(() => {
  status.textContent = "Ayarlar yüklenemedi. Eklentiyi yeniden aç.";
});
