import { ChatGPTClient } from "../chatgpt/client";
import { GroqClient, normalizeProviderModelId } from "../groq/client";
import { isApiKeyProviderId, isProviderId } from "../shared/messages";
import {
  AppError,
  type ApiKeyProviderId,
  type ApiKeyProviderSettings,
  type ChatGPTSettings,
  type GroqSettings,
  type ProviderId,
  type Settings,
  type SettingsStatus,
  type StorageArea,
} from "../shared/types";

const KEY = "settings";

interface SavedApiKeyConfig {
  apiKey: string;
  model: string;
  validated: true;
}

interface SavedChatGPTConfig {
  accountId: string;
  model: string;
  validated: true;
}

interface StoredSettingsRecord {
  provider?: ProviderId;
  apiKey?: string;
  model?: string;
  validated?: true;
  groq?: SavedApiKeyConfig;
  gemini?: SavedApiKeyConfig;
  openrouter?: SavedApiKeyConfig;
  chatgpt?: SavedChatGPTConfig;
}

function isSavedApiKeyConfig(value: unknown): value is SavedApiKeyConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SavedApiKeyConfig>;
  return (
    typeof v.apiKey === "string" &&
    v.apiKey.trim().length > 0 &&
    typeof v.model === "string" &&
    v.model.trim().length > 0 &&
    v.validated === true
  );
}

function isSavedChatGPTConfig(value: unknown): value is SavedChatGPTConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SavedChatGPTConfig>;
  return (
    typeof v.accountId === "string" &&
    v.accountId.trim().length > 0 &&
    typeof v.model === "string" &&
    v.model.trim().length > 0 &&
    v.validated === true
  );
}

function normalizeStored(raw: unknown): StoredSettingsRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  let groq = isSavedApiKeyConfig(r.groq) ? r.groq : undefined;
  let gemini = isSavedApiKeyConfig(r.gemini) ? r.gemini : undefined;
  let openrouter = isSavedApiKeyConfig(r.openrouter) ? r.openrouter : undefined;
  const chatgpt = isSavedChatGPTConfig(r.chatgpt) ? r.chatgpt : undefined;

  if (
    typeof r.apiKey === "string" &&
    r.apiKey.trim() &&
    typeof r.model === "string" &&
    r.model.trim() &&
    r.validated === true
  ) {
    const topConfig: SavedApiKeyConfig = {
      apiKey: r.apiKey,
      model: r.model,
      validated: true,
    };
    if (r.provider === "gemini" && !gemini) {
      gemini = topConfig;
    } else if (r.provider === "openrouter" && !openrouter) {
      openrouter = topConfig;
    } else if (!groq && (r.provider === undefined || r.provider === "groq")) {
      groq = topConfig;
    }
  }

  let provider: ProviderId = "groq";
  if (isProviderId(r.provider)) {
    provider = r.provider;
  } else if (chatgpt && !groq && !gemini && !openrouter) {
    provider = "chatgpt";
  } else if (gemini && !groq) {
    provider = "gemini";
  } else if (openrouter && !groq) {
    provider = "openrouter";
  }

  return { provider, groq, gemini, openrouter, chatgpt };
}

export class SettingsStore {
  constructor(
    private area: StorageArea,
    private factory: (s: ApiKeyProviderSettings) => Pick<GroqClient, "verify"> = (
      s,
    ) => new GroqClient(s),
    private chatGptFactory: (
      s: ChatGPTSettings,
    ) => Pick<ChatGPTClient, "verify"> = (s) => new ChatGPTClient(s),
  ) {}

  async initialize(): Promise<void> {
    await this.area.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  }

  private async readRaw(): Promise<StoredSettingsRecord | null> {
    const { settings } = await this.area.get(KEY);
    return normalizeStored(settings);
  }

  private async persist(next: StoredSettingsRecord): Promise<void> {
    const hasAny = Boolean(
      next.groq || next.gemini || next.openrouter || next.chatgpt,
    );
    if (!hasAny) {
      await this.area.remove(KEY);
      return;
    }
    const provider: ProviderId = next.provider ?? "groq";
    const record: StoredSettingsRecord = {
      provider,
      ...(next.groq ? { groq: next.groq } : {}),
      ...(next.gemini ? { gemini: next.gemini } : {}),
      ...(next.openrouter ? { openrouter: next.openrouter } : {}),
      ...(next.chatgpt ? { chatgpt: next.chatgpt } : {}),
    };
    if (isApiKeyProviderId(provider) && next[provider]) {
      record.apiKey = next[provider]!.apiKey;
      record.model = next[provider]!.model;
      record.validated = true;
    }
    await this.area.set({ [KEY]: record });
  }

  async getSettings(): Promise<Settings | null> {
    const stored = await this.readRaw();
    if (!stored) return null;
    const provider = stored.provider ?? "groq";
    if (provider === "chatgpt") {
      return stored.chatgpt
        ? {
            provider: "chatgpt",
            accountId: stored.chatgpt.accountId,
            model: stored.chatgpt.model,
            validated: true,
          }
        : null;
    }
    const apiConfig = stored[provider];
    return apiConfig
      ? {
          provider,
          apiKey: apiConfig.apiKey,
          model: apiConfig.model,
          validated: true,
        }
      : null;
  }

  async getStatus(): Promise<SettingsStatus> {
    const stored = await this.readRaw();
    const active = await this.getSettings();
    const provider: ProviderId = stored?.provider ?? "groq";
    return {
      configured: active !== null,
      provider,
      model: active?.model,
      accountId: active?.provider === "chatgpt" ? active.accountId : undefined,
      groq: {
        configured: Boolean(stored?.groq),
        model: stored?.groq?.model,
      },
      gemini: {
        configured: Boolean(stored?.gemini),
        model: stored?.gemini?.model,
      },
      openrouter: {
        configured: Boolean(stored?.openrouter),
        model: stored?.openrouter?.model,
      },
      chatgpt: {
        configured: Boolean(stored?.chatgpt),
        model: stored?.chatgpt?.model,
        accountId: stored?.chatgpt?.accountId,
      },
    };
  }

  async getSavedApiKeySettings(
    provider: ApiKeyProviderId,
  ): Promise<ApiKeyProviderSettings | null> {
    const stored = await this.readRaw();
    const cfg = stored?.[provider];
    return cfg
      ? {
          provider,
          apiKey: cfg.apiKey,
          model: cfg.model,
          validated: true,
        }
      : null;
  }

  async getSavedGroqSettings(): Promise<GroqSettings | null> {
    return (await this.getSavedApiKeySettings("groq")) as GroqSettings | null;
  }

  async validateAndSaveApiKeySettings(
    provider: ApiKeyProviderId,
    apiKey: string,
    model: string,
  ): Promise<ApiKeyProviderSettings> {
    const current = await this.readRaw();
    const key = apiKey.trim() || current?.[provider]?.apiKey;
    if (!key) {
      throw new AppError("missing_key", "Önce kendi API anahtarınızı girin.");
    }
    const normalizedModel = normalizeProviderModelId(provider, model);
    if (!normalizedModel) {
      throw new AppError("unsupported_model", "Lütfen bir model seçin.");
    }
    const settings: ApiKeyProviderSettings = {
      provider,
      apiKey: key,
      model: normalizedModel,
      validated: true,
    };
    await this.factory(settings).verify();
    await this.persist({
      ...(current ?? {}),
      provider,
      [provider]: { apiKey: key, model: normalizedModel, validated: true },
    });
    return settings;
  }

  async validateAndSaveGroqSettings(
    apiKey: string,
    model: string,
  ): Promise<GroqSettings> {
    return (await this.validateAndSaveApiKeySettings(
      "groq",
      apiKey,
      model,
    )) as GroqSettings;
  }

  async validateAndSaveSettings(
    apiKey: string,
    model: string,
    provider: ApiKeyProviderId = "groq",
  ): Promise<void> {
    await this.validateAndSaveApiKeySettings(provider, apiKey, model);
  }

  async validateAndSaveChatGPTSettings(
    accountId: string,
    model: string,
  ): Promise<ChatGPTSettings> {
    const trimmedAccount = accountId.trim();
    const trimmedModel = model.trim();
    if (!trimmedAccount) {
      throw new AppError("missing_key", "Önce ChatGPT ile giriş yapın.");
    }
    if (!trimmedModel) {
      throw new AppError(
        "unsupported_model",
        "Lütfen bir ChatGPT modeli seçin.",
      );
    }
    const settings: ChatGPTSettings = {
      provider: "chatgpt",
      accountId: trimmedAccount,
      model: trimmedModel,
      validated: true,
    };
    await this.chatGptFactory(settings).verify();
    const current = await this.readRaw();
    await this.persist({
      ...(current ?? {}),
      provider: "chatgpt",
      chatgpt: {
        accountId: trimmedAccount,
        model: trimmedModel,
        validated: true,
      },
    });
    return settings;
  }

  async selectProvider(provider: ProviderId): Promise<Settings | null> {
    const current = (await this.readRaw()) ?? {};
    await this.persist({ ...current, provider });
    return await this.getSettings();
  }

  private resolveFallbackProvider(
    record: StoredSettingsRecord,
    cleared: ProviderId,
  ): ProviderId {
    const candidates: ProviderId[] = ["groq", "gemini", "openrouter", "chatgpt"];
    for (const candidate of candidates) {
      if (candidate !== cleared && record[candidate]) {
        return candidate;
      }
    }
    return cleared;
  }

  async clearApiKeySettings(provider?: ApiKeyProviderId): Promise<void> {
    const current = await this.readRaw();
    if (!current) {
      await this.area.remove(KEY);
      return;
    }
    const target: ApiKeyProviderId =
      provider ??
      (isApiKeyProviderId(current.provider) ? current.provider : "groq");
    const next: StoredSettingsRecord = { ...current };
    delete next[target];
    if (next.provider === target) {
      next.provider = this.resolveFallbackProvider(next, target);
    }
    await this.persist(next);
  }

  async clearGroqSettings(): Promise<void> {
    await this.clearApiKeySettings("groq");
  }

  async clearChatGPTSettings(accountId?: string): Promise<void> {
    const current = await this.readRaw();
    if (!current?.chatgpt) return;
    if (accountId && current.chatgpt.accountId !== accountId) return;
    const next: StoredSettingsRecord = { ...current };
    delete next.chatgpt;
    if (next.provider === "chatgpt") {
      next.provider = this.resolveFallbackProvider(next, "chatgpt");
    }
    await this.persist(next);
  }

  async clearSettings(provider?: ApiKeyProviderId): Promise<void> {
    await this.clearApiKeySettings(provider);
  }
}
