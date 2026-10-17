import {
  AppError,
  type ApiKeyProviderId,
  type ApiKeyProviderSettings,
  type Meaning,
  type ModelOption,
  type PageContent,
  type SelectionContext,
} from "../shared/types";
import { meaningPrompt, summaryPrompt, verifyPrompt } from "./prompts";
import { parseJSON, parseMeaning, parseSummary } from "./schema";

export const API_PROVIDER_BASE_URLS: Record<ApiKeyProviderId, string> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

const PROVIDER_LABELS: Record<ApiKeyProviderId, string> = {
  groq: "Groq",
  gemini: "Gemini",
  openrouter: "OpenRouter",
};

export function normalizeApiKey(raw: string): string {
  const apiKey = raw.trim();
  if (!apiKey || !/^[\x21-\x7e]+$/.test(apiKey)) {
    throw new AppError(
      "invalid_key_format",
      "API anahtarının biçimi geçersiz. Yalnızca anahtarın kendisini kopyalayın; boşluk, satır sonu veya Türkçe karakter içermemeli.",
    );
  }
  return apiKey;
}

export function normalizeProviderModelId(
  provider: ApiKeyProviderId,
  modelId: string,
): string {
  const trimmed = modelId.trim();
  if (provider === "gemini") {
    return trimmed.replace(/^models\//, "");
  }
  return trimmed;
}

export function isFreeOpenRouterModel(
  modelId: string,
  pricing?: { prompt?: unknown; completion?: unknown; request?: unknown },
): boolean {
  const trimmed = modelId.trim();
  if (trimmed !== "openrouter/free" && !trimmed.endsWith(":free")) {
    return false;
  }
  if (pricing && typeof pricing === "object") {
    for (const key of ["prompt", "completion", "request"] as const) {
      const raw = pricing[key];
      if (raw !== undefined && raw !== null && raw !== "") {
        const num = Number(raw);
        if (!Number.isFinite(num) || num !== 0) {
          return false;
        }
      }
    }
  }
  return true;
}

export class GroqClient {
  constructor(
    private settings: ApiKeyProviderSettings,
    private fetcher: typeof fetch = fetch,
  ) {}

  private get provider(): ApiKeyProviderId {
    return this.settings.provider ?? "groq";
  }

  private get baseUrl(): string {
    return API_PROVIDER_BASE_URLS[this.provider];
  }

  private get providerLabel(): string {
    return PROVIDER_LABELS[this.provider];
  }

  private async request(path: string, body?: unknown): Promise<any> {
    const apiKey = normalizeApiKey(this.settings.apiKey);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 45000);
    try {
      // Native browser fetch rejects an unrelated object as its receiver.
      const fetcher = this.fetcher;
      const response = await fetcher(this.baseUrl + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: abort.signal,
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            "invalid_key",
            `${this.providerLabel} anahtarı geçersiz veya erişim izni yok. Ayarları kontrol edin.`,
          );
        if (response.status === 429)
          throw new AppError(
            "rate_limit",
            `${this.providerLabel} kullanım kotası aşıldı. Bir süre bekleyin ve limitlerinizi kontrol edin.`,
          );
        if (
          response.status === 400 ||
          response.status === 404 ||
          response.status === 413
        )
          throw new AppError(
            "unsupported_model",
            "Model veya bağlam sınırı bu isteği desteklemiyor. Başka model ya da daha kısa sayfa deneyin.",
          );
        throw new AppError(
          "provider_error",
          `${this.providerLabel} şu anda yanıt veremiyor. Daha sonra yeniden deneyin.`,
        );
      }
      try {
        return await response.json();
      } catch {
        throw new AppError(
          "invalid_response",
          `${this.providerLabel} geçerli bir yanıt vermedi.`,
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        abort.signal.aborted ? "timeout" : "network",
        abort.signal.aborted
          ? "İstek zaman aşımına uğradı. Yeniden deneyin."
          : `${this.providerLabel} bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<ModelOption[]> {
    const value = await this.request("/models");
    if (!Array.isArray(value?.data))
      throw new AppError("invalid_response", "Model listesi okunamadı.");
    const seen = new Set<string>();
    const options: ModelOption[] = [];
    for (const m of value.data) {
      if (typeof m?.id !== "string" || m.active === false) continue;
      if (this.provider === "openrouter") {
        if (!isFreeOpenRouterModel(m.id, m.pricing)) continue;
      }
      const id = normalizeProviderModelId(this.provider, m.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const displayName =
        typeof m.display_name === "string" && m.display_name.trim()
          ? m.display_name.trim()
          : typeof m.name === "string" && m.name.trim()
            ? m.name.trim()
            : undefined;
      options.push(
        displayName && displayName !== id
          ? { id, label: `${id} (${displayName})` }
          : { id },
      );
    }
    return options.sort((a: ModelOption, b: ModelOption) =>
      a.id.localeCompare(b.id),
    );
  }

  private async chat(instruction: string, data: unknown): Promise<string> {
    const selectedModel = normalizeProviderModelId(
      this.provider,
      this.settings.model,
    );
    if (
      this.provider === "openrouter" &&
      !isFreeOpenRouterModel(selectedModel)
    ) {
      throw new AppError(
        "unsupported_model",
        "OpenRouter'da yalnızca ücretsiz (:free veya openrouter/free) modeller kullanılabilir.",
      );
    }
    const value = await this.request("/chat/completions", {
      model: selectedModel,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: JSON.stringify(data) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });
    const choice = value?.choices?.[0];
    const content = choice?.message?.content;
    if (
      (choice?.finish_reason !== undefined &&
        choice?.finish_reason !== null &&
        choice?.finish_reason !== "stop") ||
      typeof content !== "string" ||
      !content.trim()
    )
      throw new AppError(
        "invalid_response",
        "Model açıklamayı tamamlayamadı. Başka model seçin veya yeniden deneyin.",
      );
    return content;
  }

  async verify(): Promise<void> {
    const selectedModel = normalizeProviderModelId(
      this.provider,
      this.settings.model,
    );
    if (
      this.provider === "openrouter" &&
      !isFreeOpenRouterModel(selectedModel)
    ) {
      throw new AppError(
        "unsupported_model",
        "OpenRouter'da yalnızca ücretsiz (:free veya openrouter/free) modeller kullanılabilir.",
      );
    }
    const models = await this.listModels();
    if (!models.some((m) => m.id === selectedModel))
      throw new AppError(
        "unsupported_model",
        "Seçilen model hesabınızda kullanılabilir değil.",
      );
    const value = parseJSON(await this.chat(verifyPrompt, { check: true }));
    if (value.ok !== true)
      throw new AppError(
        "unsupported_model",
        "Bu model JSON yanıtı doğrulamasını geçemedi. Başka model seçin.",
      );
  }

  async summarize(text: string): Promise<string> {
    return parseSummary(await this.chat(summaryPrompt, { text }));
  }

  async explain(
    page: PageContent,
    summary: string,
    selection: SelectionContext,
  ): Promise<Meaning> {
    return parseMeaning(
      await this.chat(meaningPrompt, { title: page.title, summary, selection }),
    );
  }
}
