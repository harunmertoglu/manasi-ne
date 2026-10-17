export type ProviderId = "groq" | "gemini" | "openrouter" | "chatgpt";
export type ApiKeyProviderId = "groq" | "gemini" | "openrouter";

export type PageContent = {
  url: string;
  title: string;
  paragraphs: string[];
  version: string;
};
export type SelectionContext = {
  text: string;
  paragraphIndex: number;
  startOffset: number;
  surrounding: string[];
};
export type Meaning = {
  word: string;
  language: "tr" | "en";
  explanation: string;
  turkishEquivalent?: string;
};

export type ApiKeyProviderSettings = {
  provider?: ApiKeyProviderId;
  apiKey: string;
  model: string;
  validated: boolean;
};

export type GroqSettings = ApiKeyProviderSettings & { provider: "groq" };
export type GeminiSettings = ApiKeyProviderSettings & { provider: "gemini" };
export type OpenRouterSettings = ApiKeyProviderSettings & {
  provider: "openrouter";
};

export type ChatGPTSettings = {
  provider: "chatgpt";
  accountId: string;
  model: string;
  validated: boolean;
};

export type Settings = ApiKeyProviderSettings | ChatGPTSettings;

export interface ProviderStatusInfo {
  configured: boolean;
  model?: string;
}

export interface SettingsStatus {
  configured: boolean;
  provider: ProviderId;
  model?: string;
  accountId?: string;
  groq: ProviderStatusInfo;
  gemini: ProviderStatusInfo;
  openrouter: ProviderStatusInfo;
  chatgpt: {
    configured: boolean;
    model?: string;
    accountId?: string;
  };
}

export type PageStatus = "preparing" | "ready" | "stale" | "error";
export type PageState = {
  tabId: number;
  generation: string;
  page: PageContent;
  status: PageStatus;
  summary: string;
  updatedAt: number;
  error?: string;
  progress?: string;
};
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };
export type ModelOption = { id: string; label?: string };
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function failure(error: unknown): Result<never> {
  return {
    ok: false,
    code: error instanceof AppError ? error.code : "unexpected",
    message:
      error instanceof AppError
        ? error.message
        : "İşlem tamamlanamadı. Lütfen yeniden deneyin.",
  };
}
export interface StorageArea {
  get(key: string | null): Promise<Record<string, any>>;
  set(value: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
  setAccessLevel?(value: { accessLevel: "TRUSTED_CONTEXTS" }): Promise<void>;
}
