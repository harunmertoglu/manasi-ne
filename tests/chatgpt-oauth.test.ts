// @vitest-environment node
import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  sign as cryptoSign,
} from "node:crypto";
import { expect, it } from "vitest";
import {
  OPENAI_API_RESOURCE,
  OPENAI_ISSUER,
  REQUIRED_SCOPES,
  buildAuthorizeUrl,
  createPkcePair,
  hasDirectInferenceScope,
  startLoopbackCallbackServer,
  verifyIdToken,
} from "../helper/oauth";

function signTestJwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  kid = "test-key-1",
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid }),
    "utf8",
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = cryptoSign(
    "RSA-SHA256",
    Buffer.from(`${header}.${body}`, "utf8"),
    privateKey,
  ).toString("base64url");
  return `${header}.${body}.${sig}`;
}

it("generates a valid S256 PKCE pair and builds initial vs returning authorize URLs", () => {
  const pkce = createPkcePair();
  const expectedChallenge = createHash("sha256")
    .update(pkce.codeVerifier)
    .digest("base64url");
  expect(pkce.codeChallenge).toBe(expectedChallenge);

  const firstUrl = new URL(
    buildAuthorizeUrl({
      authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
      redirectUri: "http://127.0.0.1:54321/auth/callback",
      state: "st1",
      nonce: "n1",
      codeChallenge: pkce.codeChallenge,
      hostId: "urn:uuid:11111111-2222-4333-8444-555555555555",
    }),
  );
  expect(firstUrl.searchParams.get("client_id")).toBe("dynamic_agent_client");
  expect(firstUrl.searchParams.get("agent_name_hint")).toBe("Manası Nedir");
  expect(firstUrl.searchParams.get("resource")).toBe(OPENAI_API_RESOURCE);
  expect(firstUrl.searchParams.get("scope")).toBe(REQUIRED_SCOPES.join(" "));

  const returningUrl = new URL(
    buildAuthorizeUrl({
      authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
      redirectUri: "http://127.0.0.1:54321/auth/callback",
      state: "st2",
      nonce: "n2",
      codeChallenge: pkce.codeChallenge,
      hostId: "urn:uuid:11111111-2222-4333-8444-555555555555",
      existingClientId: "oai_client_existing",
    }),
  );
  expect(returningUrl.searchParams.get("client_id")).toBe(
    "oai_client_existing",
  );
  expect(returningUrl.searchParams.has("agent_name_hint")).toBe(false);
});

it("captures loopback OAuth callback on 127.0.0.1 and rejects mismatched state", async () => {
  const srv = await startLoopbackCallbackServer({
    expectedState: "good-state",
  });
  const pending = srv.waitForCallback();
  const res = await fetch(
    `${srv.redirectUri}?code=auth_code_1&state=good-state&client_id=dyn_client_1`,
  );
  expect(res.status).toBe(200);
  await expect(pending).resolves.toEqual({
    code: "auth_code_1",
    clientId: "dyn_client_1",
  });

  const srvBad = await startLoopbackCallbackServer({
    expectedState: "expected-state",
  });
  const [badRes] = await Promise.all([
    fetch(
      `${srvBad.redirectUri}?code=auth_code_1&state=wrong-state&client_id=dyn_client_1`,
    ),
    expect(srvBad.waitForCallback()).rejects.toMatchObject({
      code: "oauth_state_mismatch",
    }),
  ]);
  expect(badRes.status).toBe(400);
});

it("verifies signed ID token claims against JWKS and rejects nonce or audience mismatch", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>),
    kid: "test-key-1",
    alg: "RS256",
    use: "sig",
  };
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      headers: { "Content-Type": "application/json" },
    });

  const now = Math.floor(Date.now() / 1000);
  const validToken = signTestJwt(
    {
      iss: OPENAI_ISSUER,
      sub: "user_abc123",
      aud: "client_xyz",
      iat: now,
      exp: now + 300,
      nonce: "nonce_expected",
      email: "reader@example.com",
      name: "Okur",
    },
    privateKey,
  );

  const claims = await verifyIdToken({
    idToken: validToken,
    jwksUri: "https://auth.openai.com/.well-known/jwks.json",
    issuer: OPENAI_ISSUER,
    clientId: "client_xyz",
    expectedNonce: "nonce_expected",
    fetchFn: mockFetch,
  });
  expect(claims).toEqual({
    sub: "user_abc123",
    email: "reader@example.com",
    name: "Okur",
  });

  await expect(
    verifyIdToken({
      idToken: validToken,
      jwksUri: "https://auth.openai.com/.well-known/jwks.json",
      issuer: OPENAI_ISSUER,
      clientId: "client_xyz",
      expectedNonce: "wrong_nonce",
      fetchFn: mockFetch,
    }),
  ).rejects.toMatchObject({ code: "oauth_token_invalid" });

  await expect(
    verifyIdToken({
      idToken: validToken,
      jwksUri: "https://auth.openai.com/.well-known/jwks.json",
      issuer: OPENAI_ISSUER,
      clientId: "wrong_client",
      expectedNonce: "nonce_expected",
      fetchFn: mockFetch,
    }),
  ).rejects.toMatchObject({ code: "oauth_token_invalid" });

  expect(
    hasDirectInferenceScope(["openid", "chatgpt.tokens.use.direct"]),
  ).toBe(true);
  expect(hasDirectInferenceScope(["openid", "profile"])).toBe(false);
});
