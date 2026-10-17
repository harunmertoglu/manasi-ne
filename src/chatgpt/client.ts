import type { HelperErrorCode } from "../shared/chatgpt";
import {
  AppError,
  type ChatGPTSettings,
  type Meaning,
  type ModelOption,
  type PageContent,
  type SelectionContext,
} from "../shared/types";
import { ChatGPTBridgeError, ChatGPTNativeBridge } from "./bridge";

function mapHelperErrorCode(code: HelperErrorCode): string {
  switch (code) {
    case "not_authenticated":
    case "reauth_required":
    case "permission_required":
    case "oauth_token_invalid":
      return "invalid_key";
    case "unsupported_model":
      return "unsupported_model";
    case "rate_limit":
      return "rate_limit";
    case "network":
    case "helper_unavailable":
      return "network";
    case "timeout":
      return "timeout";
    case "unsupported_language":
      return "unsupported_language";
    case "invalid_response":
      return "invalid_response";
    default:
      return "provider_error";
  }
}

export class ChatGPTClient {
  constructor(
    private readonly settings: ChatGPTSettings,
    private readonly bridge: ChatGPTNativeBridge = new ChatGPTNativeBridge(),
  ) {}

  async listModels(): Promise<ModelOption[]> {
    return await this.wrap(() =>
      this.bridge.listModels(this.settings.accountId),
    );
  }

  async verify(): Promise<void> {
    await this.wrap(() =>
      this.bridge.verifyModel(this.settings.accountId, this.settings.model),
    );
  }

  async summarize(text: string): Promise<string> {
    return await this.wrap(() =>
      this.bridge.summarize(this.settings.accountId, this.settings.model, text),
    );
  }

  async explain(
    page: PageContent,
    summary: string,
    selection: SelectionContext,
  ): Promise<Meaning> {
    return await this.wrap(() =>
      this.bridge.explain(
        this.settings.accountId,
        this.settings.model,
        page.title,
        summary,
        selection,
      ),
    );
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ChatGPTBridgeError) {
        throw new AppError(mapHelperErrorCode(error.code), error.message);
      }
      throw error;
    }
  }
}
