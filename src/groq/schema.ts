import { AppError, type Meaning } from "../shared/types";
export function parseJSON(content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(content);
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {
    /* Safe error below. */
  }
  throw new AppError(
    "invalid_response",
    "Model geçerli bir yanıt vermedi. Yeniden deneyin veya başka model seçin.",
  );
}
export function parseMeaning(content: string): Meaning {
  const value = parseJSON(content);
  if (
    typeof value.language === "string" &&
    !["tr", "en"].includes(value.language)
  )
    throw new AppError(
      "unsupported_language",
      "İlk sürüm yalnızca Türkçe ve İngilizce ifadeleri destekliyor.",
    );
  const valid = (v: unknown, max: number): v is string =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (
    !valid(value.word, 200) ||
    !valid(value.explanation, 3000) ||
    !["tr", "en"].includes(String(value.language)) ||
    (value.language === "en" && !valid(value.turkishEquivalent, 1000))
  )
    throw new AppError(
      "invalid_response",
      "Model yanıtında gerekli açıklama alanları eksik. Yeniden deneyin.",
    );
  return {
    word: value.word,
    language: value.language as "tr" | "en",
    explanation: value.explanation,
    ...(value.language === "en"
      ? { turkishEquivalent: value.turkishEquivalent as string }
      : {}),
  };
}
