import type { Meaning, ModelOption, SelectionContext } from "./types";

export const CHATGPT_HOST_NAME = "com.manasi_nedir.chatgpt";

export type HelperErrorCode =
  | "helper_unavailable"
  | "not_authenticated"
  | "reauth_required"
  | "permission_required"
  | "oauth_cancelled"
  | "oauth_state_mismatch"
  | "oauth_token_invalid"
  | "unsupported_model"
  | "rate_limit"
  | "network"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "unsupported_language"
  | "unsafe_storage";

export type AccountState =
  | "ready"
  | "reauth_required"
  | "permission_required"
  | "signed_out";

export interface ChatGPTAccountSummary {
  accountId: string;
  email?: string;
  displayName?: string;
  subject: string;
  clientId: string;
  grantedScopes: string[];
  state: AccountState;
  updatedAt: number;
}

export interface HelperStatusPayload {
  installed: true;
  version: string;
  activeAccountId?: string;
  accounts: ChatGPTAccountSummary[];
}

export type HelperRequest =
  | { id: string; type: "HELPER_STATUS" }
  | { id: string; type: "AUTH_SIGN_IN"; accountId?: string }
  | { id: string; type: "AUTH_SIGN_OUT"; accountId?: string }
  | { id: string; type: "MODELS_LIST"; accountId?: string }
  | {
      id: string;
      type: "VERIFY_MODEL";
      accountId?: string;
      model: string;
    }
  | {
      id: string;
      type: "SUMMARIZE";
      accountId?: string;
      model: string;
      text: string;
    }
  | {
      id: string;
      type: "EXPLAIN";
      accountId?: string;
      model: string;
      title?: string;
      summary: string;
      selection: SelectionContext;
    };

export type HelperResponse<T = unknown> =
  | { id: string; ok: true; value: T }
  | { id: string; ok: false; code: HelperErrorCode; message: string };

export type HelperModelListPayload = ModelOption[];
export type HelperSummarizePayload = { summary: string };
export type HelperExplainPayload = Meaning;
