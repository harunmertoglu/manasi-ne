// @vitest-environment node
import {
  generateKeyPairSync,
  type KeyObject,
  sign as cryptoSign,
} from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { OPENAI_ISSUER } from "../helper/oauth";
import { ChatGPTSessionManager } from "../helper/session";
import { CredentialStore } from "../helper/store";

const tempDirs: string[] = [];
afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeStore(): Promise<CredentialStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "manasi-session-"));
  tempDirs.push(dir);
  return new CredentialStore(path.join(dir, "chatgpt"));
}

function signTestJwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  kid = "k1",
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

it("completes initial sign-in, stores credentials, and reuses client_id on subsequent sign-in and after sign-out", async () => {
  const store = await makeStore();
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>),
    kid: "k1",
    alg: "RS256",
    use: "sig",
  };
  let lastAuthorizeUrl!: URL;
  let lastNonce = "";

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(
        JSON.stringify({
          issuer: OPENAI_ISSUER,
          authorization_endpoint: "https://auth.openai.com/oauth/authorize",
          token_endpoint: "https://auth.openai.com/oauth/token",
          jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
          revocation_endpoint: "https://auth.openai.com/oauth/revoke",
        }),
      );
    }
    if (url.endsWith("/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }));
    }
    if (url.endsWith("/oauth/token")) {
      const now = Math.floor(Date.now() / 1000);
      const idToken = signTestJwt(
        {
          iss: OPENAI_ISSUER,
          sub: "subj_1",
          aud: "dyn_client_99",
          iat: now,
          exp: now + 300,
          nonce: lastNonce,
          email: "test@example.com",
        },
        privateKey,
      );
      return new Response(
        JSON.stringify({
          access_token: "at_initial",
          refresh_token: "rt_initial",
          id_token: idToken,
          expires_in: 3600,
          scope:
            "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        }),
      );
    }
    return new Response("ok");
  };

  const manager = new ChatGPTSessionManager(store, mockFetch, async (authUrl) => {
    lastAuthorizeUrl = new URL(authUrl);
    lastNonce = lastAuthorizeUrl.searchParams.get("nonce")!;
    const redirectUri = lastAuthorizeUrl.searchParams.get("redirect_uri")!;
    const state = lastAuthorizeUrl.searchParams.get("state")!;
    await fetch(
      `${redirectUri}?code=code_123&state=${state}&client_id=dyn_client_99`,
    );
  });

  const status1 = await manager.signIn();
  expect(lastAuthorizeUrl.searchParams.get("client_id")).toBe(
    "dynamic_agent_client",
  );
  expect(status1.accounts[0]?.state).toBe("ready");
  expect(status1.accounts[0]?.clientId).toBe("dyn_client_99");

  await manager.signIn(status1.activeAccountId);
  expect(lastAuthorizeUrl.searchParams.get("client_id")).toBe("dyn_client_99");
  expect(lastAuthorizeUrl.searchParams.has("agent_name_hint")).toBe(false);

  // Even after signOut, a returning signIn on the same host reuses registeredClientId
  await manager.signOut(status1.activeAccountId);
  await manager.signIn();
  expect(lastAuthorizeUrl.searchParams.get("client_id")).toBe("dyn_client_99");
  expect(lastAuthorizeUrl.searchParams.has("agent_name_hint")).toBe(false);
});

it("fails closed with permission_required when chatgpt.tokens.use.direct is not granted", async () => {
  const store = await makeStore();
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>),
    kid: "k1",
    alg: "RS256",
    use: "sig",
  };
  let lastNonce = "";

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(
        JSON.stringify({
          issuer: OPENAI_ISSUER,
          authorization_endpoint: "https://auth.openai.com/oauth/authorize",
          token_endpoint: "https://auth.openai.com/oauth/token",
          jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
        }),
      );
    }
    if (url.endsWith("/jwks.json")) {
      return new Response(JSON.stringify({ keys: [jwk] }));
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = signTestJwt(
      {
        iss: OPENAI_ISSUER,
        sub: "subj_no_direct",
        aud: "dyn_client_1",
        iat: now,
        exp: now + 300,
        nonce: lastNonce,
      },
      privateKey,
    );
    return new Response(
      JSON.stringify({
        access_token: "at_1",
        refresh_token: "rt_1",
        id_token: idToken,
        expires_in: 3600,
        scope: "openid profile email offline_access",
      }),
    );
  };

  const manager = new ChatGPTSessionManager(store, mockFetch, async (authUrl) => {
    const u = new URL(authUrl);
    lastNonce = u.searchParams.get("nonce")!;
    await fetch(
      `${u.searchParams.get("redirect_uri")}?code=c1&state=${u.searchParams.get("state")}&client_id=dyn_client_1`,
    );
  });

  await expect(manager.signIn()).rejects.toMatchObject({
    code: "permission_required",
  });
  const status = await manager.getStatus();
  expect(status.accounts[0]?.state).toBe("permission_required");
});

it("deduplicates concurrent refreshes into a single token refresh call and persists rotated refresh_token", async () => {
  const store = await makeStore();
  await store.writeAccounts({
    activeAccountId: "acct_1",
    accounts: [
      {
        accountId: "acct_1",
        subject: "sub_1",
        clientId: "client_1",
        grantedScopes: ["openid", "chatgpt.tokens.use.direct"],
        state: "ready",
        updatedAt: Date.now(),
      },
    ],
  });
  await store.writeSecret({
    accountId: "acct_1",
    clientId: "client_1",
    accessToken: "expired_at",
    refreshToken: "old_rt",
    expiresAt: Date.now() - 10_000,
    grantedScopes: ["openid", "chatgpt.tokens.use.direct"],
  });

  let refreshCalls = 0;
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(
        JSON.stringify({
          issuer: OPENAI_ISSUER,
          authorization_endpoint: "https://auth.openai.com/oauth/authorize",
          token_endpoint: "https://auth.openai.com/oauth/token",
          jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
        }),
      );
    }
    refreshCalls++;
    await new Promise((r) => setTimeout(r, 30));
    return new Response(
      JSON.stringify({
        access_token: "fresh_at",
        refresh_token: "rotated_rt",
        expires_in: 3600,
        scope: "openid chatgpt.tokens.use.direct",
      }),
    );
  };

  const manager = new ChatGPTSessionManager(store, mockFetch);
  const [r1, r2] = await Promise.all([
    manager.getValidAccessToken("acct_1"),
    manager.getValidAccessToken("acct_1"),
  ]);
  expect(r1.accessToken).toBe("fresh_at");
  expect(r2.accessToken).toBe("fresh_at");
  expect(refreshCalls).toBe(1);
  expect((await store.readSecret("acct_1"))?.refreshToken).toBe("rotated_rt");
});

it("marks account reauth_required when refresh fails with 400 invalid_grant and revokes + deletes secret on signOut", async () => {
  const store = await makeStore();
  const hostIdBefore = await store.getOrCreateHostId();
  await store.writeAccounts({
    activeAccountId: "acct_1",
    accounts: [
      {
        accountId: "acct_1",
        subject: "sub_1",
        clientId: "client_1",
        grantedScopes: ["openid", "chatgpt.tokens.use.direct"],
        state: "ready",
        updatedAt: Date.now(),
      },
    ],
  });
  await store.writeSecret({
    accountId: "acct_1",
    clientId: "client_1",
    accessToken: "expired_at",
    refreshToken: "revoked_rt",
    expiresAt: Date.now() - 10_000,
    grantedScopes: ["openid", "chatgpt.tokens.use.direct"],
  });

  let revokeCalled = false;
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(
        JSON.stringify({
          issuer: OPENAI_ISSUER,
          authorization_endpoint: "https://auth.openai.com/oauth/authorize",
          token_endpoint: "https://auth.openai.com/oauth/token",
          jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
          revocation_endpoint: "https://auth.openai.com/oauth/revoke",
        }),
      );
    }
    if (url.endsWith("/oauth/revoke")) {
      revokeCalled = true;
      return new Response("", { status: 200 });
    }
    return new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
    });
  };

  const manager = new ChatGPTSessionManager(store, mockFetch);
  await expect(manager.getValidAccessToken("acct_1")).rejects.toMatchObject({
    code: "reauth_required",
  });
  expect((await manager.getStatus()).accounts[0]?.state).toBe(
    "reauth_required",
  );

  const afterSignOut = await manager.signOut("acct_1");
  expect(revokeCalled).toBe(true);
  expect(afterSignOut.accounts).toHaveLength(0);
  expect(await store.readSecret("acct_1")).toBeNull();
  expect(await store.getOrCreateHostId()).toBe(hostIdBefore);
});
