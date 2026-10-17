import { meaningPrompt, summaryPrompt, verifyPrompt } from "../src/groq/prompts";
import { parseJSON, parseMeaning, parseSummary } from "../src/groq/schema";
import {
  AppError,
  type Meaning,
  type ModelOption,
  type SelectionContext,
} from "../src/shared/types";
import { parseResponsesSseStream } from "./sse";
import { HelperError } from "./store";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

interface OpenAIModelItem {
  slug?: unknown;
  id?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  supported_in_api?: unknown;
}

export class OpenAIChatGPTClient {
  constructor(
    private readonly getAccessToken: (
      accountId?: string,
      forceRefresh?: boolean,
    ) => Promise<{ accountId: string; accessToken: string }>,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  async listModels(accountId?: string): Promise<ModelOption[]> {
    const response = await this.authedFetch(accountId, "/models", {
      method: "GET",
    });
    let body: { models?: OpenAIModelItem[]; data?: OpenAIModelItem[] };
    try {
      body = (await response.json()) as {
        models?: OpenAIModelItem[];
        data?: OpenAIModelItem[];
      };
    } catch {
      throw new HelperError(
        "invalid_response",
        "OpenAI model listesi okunamadı.",
      );
    }
    const rawList = Array.isArray(body?.models)
      ? body.models
      : Array.isArray(body?.data)
        ? body.data
        : [];
    const seen = new Set<string>();
    const options: ModelOption[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") continue;
      if (item.visibility !== undefined && item.visibility !== "list") continue;
      if (item.supported_in_api === false) continue;
      const slug =
        typeof item.slug === "string" && item.slug.trim()
          ? item.slug.trim()
          : typeof item.id === "string" && item.id.trim()
            ? item.id.trim()
            : "";
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const label =
        typeof item.display_name === "string" && item.display_name.trim()
          ? `${item.display_name.trim()} (${slug})`
          : slug;
      options.push({ id: slug, label });
    }
    return options;
  }

  async verifyModel(accountId: string | undefined, model: string): Promise<void> {
    if (!model.trim()) {
      throw new HelperError("unsupported_model", "Lütfen bir model seçin.");
    }
    const models = await this.listModels(accountId);
    if (!models.some((m) => m.id === model)) {
      throw new HelperError(
        "unsupported_model",
        "Seçilen ChatGPT modeli bu hesapta kullanılamıyor.",
      );
    }
    const raw = await this.respond(
      accountId,
      model,
      verifyPrompt,
      JSON.stringify({ check: true }),
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJSON(raw);
    } catch {
      throw new HelperError(
        "unsupported_model",
        "Seçilen model JSON doğrulama yanıtı üretemedi.",
      );
    }
    if (parsed?.ok !== true) {
      throw new HelperError(
        "unsupported_model",
        "Seçilen model JSON yanıt doğrulamasını geçemedi.",
      );
    }
  }

  async summarize(
    accountId: string | undefined,
    model: string,
    text: string,
  ): Promise<string> {
    const raw = await this.respond(
      accountId,
      model,
      summaryPrompt,
      JSON.stringify({ text }),
    );
    return this.parse(() => parseSummary(raw));
  }

  async explain(
    accountId: string | undefined,
    model: string,
    summary: string,
    selection: SelectionContext,
    title = "",
  ): Promise<Meaning> {
    const raw = await this.respond(
      accountId,
      model,
      meaningPrompt,
      JSON.stringify({ title, summary, selection }),
    );
    return this.parse(() => parseMeaning(raw));
  }

  private parse<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof AppError && error.code === "unsupported_language") {
        throw new HelperError("unsupported_language", error.message);
      }
      throw new HelperError(
        "invalid_response",
        "Model beklenen biçimde yanıt vermedi. Başka bir model deneyin.",
      );
    }
  }

  private async respond(
    accountId: string | undefined,
    model: string,
    instructions: string,
    userText: string,
  ): Promise<string> {
    const response = await this.authedFetch(accountId, "/responses", {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        stream: true,
        instructions,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: userText }],
          },
        ],
      }),
    });
    return await parseResponsesSseStream(response.body);
  }

  private async authedFetch(
    accountId: string | undefined,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const first = await this.getAccessToken(accountId, false);
    let response = await this.rawFetch(path, init, first.accessToken);
    if (response.status === 401) {
      const refreshed = await this.getAccessToken(accountId, true);
      response = await this.rawFetch(path, init, refreshed.accessToken);
    }
    if (response.status === 401) {
      throw new HelperError(
        "reauth_required",
        "ChatGPT oturumu geçersiz. Lütfen yeniden giriş yapın.",
      );
    }
    if (response.status === 403) {
      throw new HelperError(
        "permission_required",
        "ChatGPT hesabınız bu işleme izin vermiyor (403).",
      );
    }
    if (response.status === 429) {
      throw new HelperError(
        "rate_limit",
        "ChatGPT kullanım veya hız sınırına ulaşıldı. Biraz sonra tekrar deneyin.",
      );
    }
    if (response.status === 400 || response.status === 404) {
      throw new HelperError(
        "unsupported_model",
        "Seçilen ChatGPT modeli bu isteği desteklemiyor.",
      );
    }
    if (!response.ok) {
      throw new HelperError(
        "provider_error",
        "OpenAI şu anda yanıt veremiyor. Daha sonra tekrar deneyin.",
      );
    }
    return response;
  }

  private async rawFetch(
    path: string,
    init: RequestInit,
    accessToken: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const callFetch = this.fetchFn;
    try {
      return await callFetch(`${OPENAI_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        throw new HelperError(
          "timeout",
          "OpenAI bağlantısı zaman aşımına uğradı.",
        );
      }
      throw new HelperError(
        "network",
        "OpenAI API’ye ulaşılamadı. İnternet bağlantınızı kontrol edin.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
