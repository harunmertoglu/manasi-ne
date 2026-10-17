import type {
  PageContent,
  ProviderId,
  SelectionContext,
} from "../shared/types";
export function cacheKey(
  page: PageContent,
  selection: SelectionContext,
  model: string,
  provider: ProviderId = "groq",
  accountId = "",
): string {
  return JSON.stringify([
    provider,
    accountId,
    page.version,
    selection.paragraphIndex,
    selection.startOffset,
    selection.text,
    model,
    "contextual-v1",
  ]);
}
