import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type {
  ChatGPTAccountSummary,
  HelperStatusPayload,
} from "../src/shared/chatgpt";
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCodeForTokens,
  fetchDiscovery,
  hasDirectInferenceScope,
  parseGrantedScopes,
  randomToken,
  refreshTokenSet,
  revokeToken,
  startLoopbackCallbackServer,
  verifyIdToken,
} from "./oauth";
import { CredentialStore, HelperError } from "./store";

export const HELPER_VERSION = "0.1.0";

export function defaultOpenBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.once("error", () =>
      reject(
        new HelperError(
          "provider_error",
          "Tarayıcıda yetkilendirme sayfası açılamadı.",
        ),
      ),
    );
    child.unref();
    resolve();
  });
}

function deriveAccountId(subject: string): string {
  return (
    "acct_" + createHash("sha256").update(subject).digest("hex").slice(0, 16)
  );
}

export class ChatGPTSessionManager {
  private inFlightRefresh = new Map<string, Promise<string>>();

  constructor(
    private readonly store: CredentialStore = new CredentialStore(),
    private readonly fetchFn: typeof fetch = fetch,
    private readonly openBrowser: (
      url: string,
    ) => Promise<void> = defaultOpenBrowser,
  ) {}

  async getStatus(): Promise<HelperStatusPayload> {
    const data = await this.store.readAccounts();
    return {
      installed: true,
      version: HELPER_VERSION,
      activeAccountId: data.activeAccountId,
      accounts: data.accounts,
    };
  }

  async signIn(requestedAccountId?: string): Promise<HelperStatusPayload> {
    const hostId = await this.store.getOrCreateHostId();
    const accounts = await this.store.readAccounts();
    const existing = requestedAccountId
      ? accounts.accounts.find((a) => a.accountId === requestedAccountId)
      : accounts.accounts.find((a) => a.accountId === accounts.activeAccountId);
    const existingClientId = existing?.clientId ?? accounts.registeredClientId;

    const discovery = await fetchDiscovery(this.fetchFn);
    const pkce = createPkcePair();
    const state = randomToken(24);
    const nonce = randomToken(24);
    const loopback = await startLoopbackCallbackServer({
      expectedState: state,
      fallbackClientId: existingClientId,
    });

    try {
      const authUrl = buildAuthorizeUrl({
        authorizationEndpoint: discovery.authorization_endpoint,
        redirectUri: loopback.redirectUri,
        state,
        nonce,
        codeChallenge: pkce.codeChallenge,
        hostId,
        existingClientId,
      });
      await this.openBrowser(authUrl);
      const callback = await loopback.waitForCallback();
      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: discovery.token_endpoint,
        code: callback.code,
        redirectUri: loopback.redirectUri,
        clientId: callback.clientId,
        codeVerifier: pkce.codeVerifier,
        fetchFn: this.fetchFn,
      });
      const claims = await verifyIdToken({
        idToken: tokens.id_token!,
        jwksUri: discovery.jwks_uri,
        issuer: discovery.issuer,
        clientId: callback.clientId,
        expectedNonce: nonce,
        fetchFn: this.fetchFn,
      });
      const scopes = parseGrantedScopes(tokens.scope);
      const accountId = deriveAccountId(claims.sub);
      const hasDirect = hasDirectInferenceScope(scopes);
      const summary: ChatGPTAccountSummary = {
        accountId,
        email: claims.email,
        displayName: claims.name,
        subject: claims.sub,
        clientId: callback.clientId,
        grantedScopes: scopes,
        state: hasDirect ? "ready" : "permission_required",
        updatedAt: Date.now(),
      };
      await this.store.writeSecret({
        accountId,
        clientId: callback.clientId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        idToken: tokens.id_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        grantedScopes: scopes,
      });
      const nextAccounts = accounts.accounts.filter(
        (a) => a.accountId !== accountId,
      );
      nextAccounts.push(summary);
      await this.store.writeAccounts({
        activeAccountId: accountId,
        registeredClientId: callback.clientId,
        accounts: nextAccounts,
      });
      if (!hasDirect) {
        throw new HelperError(
          "permission_required",
          "ChatGPT doğrudan model kullanım izni (chatgpt.tokens.use.direct) verilmedi.",
        );
      }
      return await this.getStatus();
    } catch (error) {
      await loopback.close();
      throw error;
    }
  }

  async getValidAccessToken(
    accountId?: string,
    forceRefresh = false,
  ): Promise<{ accountId: string; accessToken: string }> {
    const accounts = await this.store.readAccounts();
    const targetId = accountId ?? accounts.activeAccountId;
    if (!targetId) {
      throw new HelperError(
        "not_authenticated",
        "Kayıtlı bir ChatGPT oturumu bulunamadı. Lütfen giriş yapın.",
      );
    }
    const summary = accounts.accounts.find((a) => a.accountId === targetId);
    if (!summary) {
      throw new HelperError(
        "not_authenticated",
        "Seçilen ChatGPT oturumu bulunamadı.",
      );
    }
    if (summary.state === "permission_required") {
      throw new HelperError(
        "permission_required",
        "ChatGPT doğrudan kullanım izni eksik. Yeniden giriş yapıp izin verin.",
      );
    }
    if (summary.state === "reauth_required") {
      throw new HelperError(
        "reauth_required",
        "ChatGPT oturumunun süresi doldu. Lütfen yeniden giriş yapın.",
      );
    }

    const secret = await this.store.readSecret(targetId);
    if (!secret) {
      throw new HelperError(
        "reauth_required",
        "ChatGPT oturum anahtarı bulunamadı. Lütfen yeniden giriş yapın.",
      );
    }
    const notExpiringSoon = secret.expiresAt - Date.now() > 60_000;
    if (!forceRefresh && notExpiringSoon) {
      return { accountId: targetId, accessToken: secret.accessToken };
    }

    const existingPromise = this.inFlightRefresh.get(targetId);
    if (existingPromise) {
      return { accountId: targetId, accessToken: await existingPromise };
    }

    const refreshWork = this.store.withRefreshLock(async () => {
      const freshSecret = await this.store.readSecret(targetId);
      if (!freshSecret) {
        throw new HelperError(
          "reauth_required",
          "ChatGPT oturum anahtarı bulunamadı.",
        );
      }
      if (!forceRefresh && freshSecret.expiresAt - Date.now() > 60_000) {
        return freshSecret.accessToken;
      }
      const discovery = await fetchDiscovery(this.fetchFn);
      try {
        const refreshed = await refreshTokenSet({
          tokenEndpoint: discovery.token_endpoint,
          refreshToken: freshSecret.refreshToken,
          clientId: freshSecret.clientId,
          fetchFn: this.fetchFn,
        });
        const nextScopes = refreshed.scope
          ? parseGrantedScopes(refreshed.scope)
          : freshSecret.grantedScopes;
        if (!hasDirectInferenceScope(nextScopes)) {
          await this.markAccountState(targetId, "permission_required");
          throw new HelperError(
            "permission_required",
            "ChatGPT doğrudan kullanım izni kaldırılmış.",
          );
        }
        await this.store.writeSecret({
          accountId: targetId,
          clientId: freshSecret.clientId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? freshSecret.refreshToken,
          idToken: refreshed.id_token ?? freshSecret.idToken,
          expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
          grantedScopes: nextScopes,
        });
        await this.markAccountState(targetId, "ready", nextScopes);
        return refreshed.access_token;
      } catch (error) {
        if (error instanceof HelperError && error.code === "reauth_required") {
          await this.markAccountState(targetId, "reauth_required");
        }
        throw error;
      }
    });

    this.inFlightRefresh.set(targetId, refreshWork);
    try {
      const accessToken = await refreshWork;
      return { accountId: targetId, accessToken };
    } finally {
      this.inFlightRefresh.delete(targetId);
    }
  }

  private async markAccountState(
    accountId: string,
    state: ChatGPTAccountSummary["state"],
    grantedScopes?: string[],
  ): Promise<void> {
    const current = await this.store.readAccounts();
    const accounts = current.accounts.map((a) =>
      a.accountId === accountId
        ? {
            ...a,
            state,
            grantedScopes: grantedScopes ?? a.grantedScopes,
            updatedAt: Date.now(),
          }
        : a,
    );
    await this.store.writeAccounts({ ...current, accounts });
  }

  async signOut(accountId?: string): Promise<HelperStatusPayload> {
    const current = await this.store.readAccounts();
    const targetId = accountId ?? current.activeAccountId;
    if (!targetId) return await this.getStatus();
    const secret = await this.store.readSecret(targetId);
    const summary = current.accounts.find((a) => a.accountId === targetId);
    if (secret) {
      try {
        const discovery = await fetchDiscovery(this.fetchFn);
        await revokeToken({
          revocationEndpoint: discovery.revocation_endpoint,
          token: secret.refreshToken,
          clientId: secret.clientId,
          fetchFn: this.fetchFn,
        });
        if (secret.accessToken) {
          await revokeToken({
            revocationEndpoint: discovery.revocation_endpoint,
            token: secret.accessToken,
            clientId: secret.clientId,
            fetchFn: this.fetchFn,
          });
        }
      } catch {
        // Best-effort revocation; local deletion still runs.
      }
      await this.store.deleteSecret(targetId);
    }
    const remaining = current.accounts.filter((a) => a.accountId !== targetId);
    await this.store.writeAccounts({
      activeAccountId:
        current.activeAccountId === targetId
          ? remaining[0]?.accountId
          : current.activeAccountId,
      registeredClientId:
        current.registeredClientId ??
        secret?.clientId ??
        summary?.clientId,
      accounts: remaining,
    });
    return await this.getStatus();
  }
}
