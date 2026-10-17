import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as cryptoVerify,
} from "node:crypto";
import http from "node:http";
import { HelperError } from "./store";

export const OPENAI_ISSUER = "https://auth.openai.com";
export const OPENAI_DISCOVERY_URL =
  "https://auth.openai.com/.well-known/openid-configuration";
export const OPENAI_API_RESOURCE = "https://api.openai.com/v1";
export const REQUIRED_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "resource.invoke",
  "chatgpt.tokens.use.direct",
] as const;

export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export function createPkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export async function fetchDiscovery(
  fetchFn: typeof fetch = fetch,
): Promise<OidcDiscoveryDocument> {
  let response: Response;
  try {
    response = await fetchFn(OPENAI_DISCOVERY_URL, { method: "GET" });
  } catch {
    throw new HelperError("network", "OpenAI kimlik servisine ulaşılamadı.");
  }
  if (!response.ok) {
    throw new HelperError(
      "provider_error",
      "OpenAI OIDC yapılandırması alınamadı.",
    );
  }
  const doc = (await response.json()) as Partial<OidcDiscoveryDocument>;
  if (
    typeof doc.issuer !== "string" ||
    typeof doc.authorization_endpoint !== "string" ||
    typeof doc.token_endpoint !== "string" ||
    typeof doc.jwks_uri !== "string"
  ) {
    throw new HelperError(
      "invalid_response",
      "OpenAI OIDC yapılandırması eksik.",
    );
  }
  return doc as OidcDiscoveryDocument;
}

export interface AuthorizeUrlParams {
  authorizationEndpoint: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  hostId: string;
  existingClientId?: string;
  agentNameHint?: string;
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(params.authorizationEndpoint);
  const clientId = params.existingClientId || "dynamic_agent_client";
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", OPENAI_API_RESOURCE);
  url.searchParams.set("ext_agent_host_id", params.hostId);
  if (!params.existingClientId) {
    url.searchParams.set(
      "agent_name_hint",
      params.agentNameHint ?? "Manası Nedir",
    );
  }
  return url.toString();
}

export interface CallbackResult {
  code: string;
  clientId: string;
}

export async function startLoopbackCallbackServer(params: {
  expectedState: string;
  fallbackClientId?: string;
  timeoutMs?: number;
}): Promise<{
  redirectUri: string;
  waitForCallback: () => Promise<CallbackResult>;
  close: () => Promise<void>;
}> {
  const timeoutMs = params.timeoutMs ?? 180_000;
  type CallbackOutcome =
    | { ok: true; value: CallbackResult }
    | { ok: false; error: Error };
  let settleOutcome!: (outcome: CallbackOutcome) => void;
  const callbackPromise = new Promise<CallbackOutcome>((resolve) => {
    settleOutcome = resolve;
  });

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || reqUrl.pathname !== "/auth/callback") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bulunamadı.");
      return;
    }
    const error = reqUrl.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>Giriş iptal edildi</title><p>ChatGPT girişi tamamlanmadı. Bu sekme kapatılabilir.</p>",
        () =>
          settleOutcome({
            ok: false,
            error: new HelperError(
              "oauth_cancelled",
              "ChatGPT yetkilendirmesi iptal edildi veya reddedildi.",
            ),
          }),
      );
      return;
    }
    const state = reqUrl.searchParams.get("state");
    const code = reqUrl.searchParams.get("code");
    const clientId =
      reqUrl.searchParams.get("client_id") ?? params.fallbackClientId ?? "";
    if (!state || state !== params.expectedState) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>Güvenlik hatası</title><p>Oturum durumu doğrulanamadı. Bu sekme kapatılabilir.</p>",
        () =>
          settleOutcome({
            ok: false,
            error: new HelperError(
              "oauth_state_mismatch",
              "OAuth state doğrulaması başarısız oldu.",
            ),
          }),
      );
      return;
    }
    if (!code || !clientId) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><meta charset='utf-8'><title>Eksik yanıt</title><p>Yetkilendirme kodu alınamadı.</p>",
        () =>
          settleOutcome({
            ok: false,
            error: new HelperError(
              "oauth_token_invalid",
              "Yetkilendirme yanıtında code veya client_id eksik.",
            ),
          }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<!doctype html><meta charset='utf-8'><title>Bağlantı tamamlandı</title><p>Manası Nedir için ChatGPT girişi tamamlandı. Bu sekmeyi kapatıp eklentiye dönebilirsiniz.</p>",
      () => settleOutcome({ ok: true, value: { code, clientId } }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new HelperError("network", "Yerel geri dönüş sunucusu başlatılamadı.");
  }
  const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;

  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

  const waitForCallback = async (): Promise<CallbackResult> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        callbackPromise,
        new Promise<CallbackOutcome>((resolve) => {
          timer = setTimeout(
            () =>
              resolve({
                ok: false,
                error: new HelperError(
                  "timeout",
                  "ChatGPT girişi zaman aşımına uğradı.",
                ),
              }),
            timeoutMs,
          );
        }),
      ]);
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    } finally {
      if (timer) clearTimeout(timer);
      await close();
    }
  };

  return { redirectUri, waitForCallback, close };
}

export interface TokenEndpointResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeCodeForTokens(params: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
  fetchFn?: typeof fetch;
}): Promise<TokenEndpointResponse> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
    resource: OPENAI_API_RESOURCE,
  });
  let response: Response;
  try {
    response = await fetchFn(params.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new HelperError(
      "network",
      "OpenAI token uç noktasına ulaşılamadı.",
    );
  }
  if (!response.ok) {
    throw new HelperError(
      "oauth_token_invalid",
      "Yetkilendirme kodu erişim anahtarına dönüştürülemedi.",
    );
  }
  const json = (await response.json()) as Partial<TokenEndpointResponse>;
  if (
    typeof json.access_token !== "string" ||
    !json.access_token ||
    typeof json.refresh_token !== "string" ||
    !json.refresh_token ||
    typeof json.id_token !== "string" ||
    !json.id_token
  ) {
    throw new HelperError(
      "oauth_token_invalid",
      "Token yanıtında zorunlu alanlar eksik.",
    );
  }
  return json as TokenEndpointResponse;
}

export async function refreshTokenSet(params: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  fetchFn?: typeof fetch;
}): Promise<TokenEndpointResponse> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    resource: OPENAI_API_RESOURCE,
  });
  let response: Response;
  try {
    response = await fetchFn(params.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new HelperError("network", "Oturum yenilenirken ağ hatası oluştu.");
  }
  if (response.status === 400 || response.status === 401) {
    throw new HelperError(
      "reauth_required",
      "ChatGPT oturumunun süresi doldu. Lütfen yeniden giriş yapın.",
    );
  }
  if (!response.ok) {
    throw new HelperError(
      "provider_error",
      "ChatGPT oturumu şu anda yenilenemiyor.",
    );
  }
  const json = (await response.json()) as Partial<TokenEndpointResponse>;
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new HelperError("oauth_token_invalid", "Yenilenen anahtar geçersiz.");
  }
  return json as TokenEndpointResponse;
}

export async function revokeToken(params: {
  revocationEndpoint?: string;
  token: string;
  clientId: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  if (!params.revocationEndpoint) return;
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    token: params.token,
    client_id: params.clientId,
  });
  try {
    await fetchFn(params.revocationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    // Best-effort revocation; local deletion still proceeds.
  }
}

export interface VerifiedIdTokenClaims {
  sub: string;
  email?: string;
  name?: string;
}

function getVerifyAlgorithm(alg: unknown): {
  algorithm: string | null;
  dsaEncoding?: "ieee-p1363";
} {
  switch (alg) {
    case "RS256":
      return { algorithm: "RSA-SHA256" };
    case "RS384":
      return { algorithm: "RSA-SHA384" };
    case "RS512":
      return { algorithm: "RSA-SHA512" };
    case "ES256":
      return { algorithm: "sha256", dsaEncoding: "ieee-p1363" };
    case "ES384":
      return { algorithm: "sha384", dsaEncoding: "ieee-p1363" };
    case "ES512":
      return { algorithm: "sha512", dsaEncoding: "ieee-p1363" };
    case "EdDSA":
      return { algorithm: null };
    default:
      throw new HelperError(
        "oauth_token_invalid",
        "ID token imza algoritması desteklenmiyor.",
      );
  }
}

export async function verifyIdToken(params: {
  idToken: string;
  jwksUri: string;
  issuer: string;
  clientId: string;
  expectedNonce: string;
  fetchFn?: typeof fetch;
}): Promise<VerifiedIdTokenClaims> {
  const fetchFn = params.fetchFn ?? fetch;
  const parts = params.idToken.split(".");
  if (parts.length !== 3) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token biçimi doğrulanamadı.",
    );
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as { alg?: unknown; kid?: unknown };
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token içeriği çözümlenemedi.",
    );
  }

  const algSpec = getVerifyAlgorithm(header.alg);

  let jwksResponse: Response;
  try {
    jwksResponse = await fetchFn(params.jwksUri, { method: "GET" });
  } catch {
    throw new HelperError(
      "oauth_token_invalid",
      "OpenAI JWKS anahtarları alınamadı.",
    );
  }
  if (!jwksResponse.ok) {
    throw new HelperError(
      "oauth_token_invalid",
      "OpenAI JWKS yanıtı geçersiz.",
    );
  }

  let keys: JsonWebKey[];
  try {
    const jwksBody = (await jwksResponse.json()) as { keys?: unknown };
    if (!Array.isArray(jwksBody?.keys) || jwksBody.keys.length === 0) {
      throw new Error("empty_jwks");
    }
    keys = jwksBody.keys as JsonWebKey[];
  } catch {
    throw new HelperError(
      "oauth_token_invalid",
      "OpenAI JWKS anahtar listesi okunamadı.",
    );
  }

  const candidates =
    typeof header.kid === "string" && header.kid
      ? keys.filter(
          (k) =>
            (k as { kid?: unknown }).kid === header.kid ||
            (k as { kid?: unknown }).kid === undefined,
        )
      : keys;

  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
  const signature = Buffer.from(encodedSignature, "base64url");
  let verified = false;

  for (const jwk of candidates) {
    try {
      const publicKey = createPublicKey({ key: jwk, format: "jwk" });
      const ok = cryptoVerify(
        algSpec.algorithm,
        signingInput,
        algSpec.dsaEncoding
          ? { key: publicKey, dsaEncoding: algSpec.dsaEncoding }
          : publicKey,
        signature,
      );
      if (ok) {
        verified = true;
        break;
      }
    } catch {
      // Try next candidate key if present
    }
  }

  if (!verified) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token imzası doğrulanamadı.",
    );
  }

  const tokenIss =
    typeof payload.iss === "string" ? payload.iss.replace(/\/+$/, "") : "";
  const expectedIss = params.issuer.replace(/\/+$/, "");
  if (!tokenIss || tokenIss !== expectedIss) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token issuer (iss) doğrulanamadı.",
    );
  }

  const aud = payload.aud;
  const audValid =
    aud === params.clientId ||
    (Array.isArray(aud) && aud.includes(params.clientId));
  if (!audValid) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token hedef kitlesi (aud) doğrulanamadı.",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token süresi dolmuş veya geçersiz.",
    );
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 60) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token henüz geçerli değil.",
    );
  }
  if (payload.nonce !== params.expectedNonce) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token nonce değeri eşleşmedi.",
    );
  }
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new HelperError(
      "oauth_token_invalid",
      "ID token kullanıcı kimliği (sub) içermiyor.",
    );
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

export function parseGrantedScopes(scopeHeader: string | undefined): string[] {
  if (!scopeHeader) return [];
  return scopeHeader
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasDirectInferenceScope(scopes: string[]): boolean {
  return scopes.includes("chatgpt.tokens.use.direct");
}
