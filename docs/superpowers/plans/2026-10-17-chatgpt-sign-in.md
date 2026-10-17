# ChatGPT Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has already selected inline execution in this session.

**Goal:** Let users choose their own ChatGPT account and available model for contextual definitions through an optional local helper, while preserving Groq.

**Architecture:** A Linux native messaging helper owns OAuth, protected credentials and official OpenAI requests. The extension sends typed commands through its service worker and receives only public account metadata and validated results. Provider changes invalidate existing page generations and caches.

**Tech Stack:** Existing TypeScript, esbuild, Vitest and Playwright; Node.js 22+ helper; Node filesystem/HTTP/crypto; `jose` for verified OIDC JWTs and `proper-lockfile` for cross-process credential locking (bundle dependencies into the helper).

**Spec:** `docs/superpowers/specs/2026-10-17-chatgpt-sign-in-design.md` (approved).

## Global Constraints

- Initial platform: Linux, Brave/Brave Origin, Chrome and Chromium; Node.js 22+; no sudo, backend, project API key or browser-cookie reuse.
- Native host: `com.manasi_nedir.chatgpt`; exact extension origin allowlist; `nativeMessaging` permission requested only on an explicit ChatGPT connection action.
- Credentials: `~/.config/manasi-nedir/chatgpt/`; directories `0700`, files `0600`, owner checked, no symlinks; atomic writes and cross-process refresh locking.
- Callback: `127.0.0.1`, dynamic port, `/auth/callback`, five-minute deadline. PKCE S256, state, nonce and signed ID token verification are mandatory.
- Initial client `dynamic_agent_client`; `agent_name_hint=Manası Nedir`; persistent `ext_agent_host_id` in `urn:uuid:...` format. Token exchange uses the issued client ID, never the initial placeholder.
- Scopes: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`; resource `https://api.openai.com/v1`. Never send `id_token_hint` through the extension.
- Official `/v1/models` uses visible `models[].slug/display_name`; inference `/v1/responses` uses `instructions`, `input`, `store:false`, `stream:true`. No unsupported sampling/output-limit fields, tools or automatic retries.
- Tokens and raw provider errors never enter native replies, browser storage, callback HTML or logs. Only `response.completed` permits a result to be returned and cached.
- Login alone does not establish plan eligibility. No automatic provider fallback. Groq quota improvements and macOS/Windows installers are outside this change.
- Login button copy: **Continue with ChatGPT**. Keep existing Turkish definitions and English definitions with Turkish equivalents.

## Review Focus

1. Two helpers refresh one rotating session concurrently: reread under the same cross-process lock and refresh once (Task 2).
2. A failed account switch overlaps an existing page operation: keep the previous provider active until validation, then reject every old generation (Task 6).
3. A successful-looking SSE stream disconnects without its terminal event: reject it and leave the cache empty (Tasks 3 and 6).
4. Installation encounters a symlink or another program's manifest: refuse without modifying that target or deleting another browser's installation (Task 4).
5. Browser disconnects during login or inference: close the callback listener, abort the request and reject pending bridge calls without leaking secrets (Tasks 2, 4 and 5).

## File and interface map

- `src/shared/chatgpt.ts`: token-free native protocol and account metadata; `src/shared/types.ts`: provider settings and model labels.
- `helper/{store,oauth,session,openai,sse,framing,host}.ts`: protected storage, authentication, refresh/revocation, inference, stream parsing and stdio transport respectively.
- `scripts/chatgpt-install.mjs`: Linux user installation/removal. `scripts/build-helper.mjs`: Node bundles in `dist-helper/`, separate from browser `dist/`.
- `src/chatgpt/{bridge,client}.ts`: native port lifecycle and provider adapter. Existing settings/controller/router/UI integrate both providers.
- Each owning task adds `tests/chatgpt-*.test.ts`; `e2e/chatgpt-native.spec.ts` covers actual installed native messaging with temporary profiles.

### Task 1: Define contracts and protected account storage

**Files:** Create `src/shared/chatgpt.ts`, `helper/store.ts`, `tests/chatgpt-store.test.ts`; modify `.gitignore` and `tsconfig.json` for helper artifacts and typechecking.

**Interfaces:** Produce `AccountInfo {id:string;label:string;status:"ready"|"signed_out"|"permission_required"}` and `ChatGPTModel {id:string;label:string}`. Native requests have `{id:string,command:NativeCommand}`; commands are `status`, `login` (optional accountId), `cancelLogin`, `models` (accountId), `summarize` (accountId,model,text), `explain` (accountId,model,page,summary,selection), `logout` (accountId) and `cancel` (targetId). Replies are `{id,result:Result<NativeValue>}`; login URL is a separate `{id,event:"authorize",url:string}` event. Define the exact command/result mapping as TypeScript unions. Produce `AccountRecord` (private subject, clientId, tokens, expiry, scopes, label), and `CredentialStore(root:string)` methods `hostId():Promise<string>`, `list():Promise<AccountInfo[]>`, `read(id):Promise<AccountRecord|null>`, `write(record):Promise<void>`, `clearTokens(id):Promise<void>`, `withLock<T>(id,work:()=>Promise<T>):Promise<T>`; string IDs are path-safe hashes of verified subject + clientId.

- [ ] Write storage tests asserting `hostId()` is stable and starts with `urn:uuid:`, same-email/different-client records have different IDs, file modes equal `0o600`, directory modes equal `0o700`, and interrupted atomic replacement preserves the old parseable record. Assert symlink, foreign owner (injected stat), broad permissions and path traversal are rejected; public `list()` contains no token or subject fields.
- [ ] Run `npx vitest run tests/chatgpt-store.test.ts`; confirm missing-module failure.
- [ ] Implement contracts and storage with injected root for temporary tests, exclusive temporary files, atomic rename and `proper-lockfile`; add bundled dependency and type declarations to package files. Validate parents and targets before filesystem access; lock directories must remain private.
- [ ] Run the targeted tests and `npm run typecheck`; expect all pass.
- [ ] Commit: `feat: add protected ChatGPT account storage and native contracts`.

### Task 2: Implement OAuth and session lifecycle

**Files:** Create `helper/oauth.ts`, `helper/session.ts`, `tests/chatgpt-oauth.test.ts`, `tests/chatgpt-session.test.ts`; update dependency lockfile for `jose`.

**Interfaces:** Consume Task 1 store. Produce `OAuthManager(store,deps)` with `login(accountId:string|undefined,onAuthorize:(url:string)=>void,signal:AbortSignal):Promise<AccountInfo>`; deps inject fetch/clock and trusted endpoint metadata only for tests. Produce `SessionManager(store,deps)` with `accessToken(accountId:string,signal:AbortSignal):Promise<string>` and `logout(accountId:string,signal:AbortSignal):Promise<{revoked:boolean}>`. Production discovery/authorization endpoints are fixed from official documentation, never native-command arguments.

- [ ] Write OAuth tests checking exact scopes/resource/host/name, callback listener ready before URL emission, S256 challenge, issued-client token exchange and returning-client reuse without `agent_name_hint` or `id_token_hint`. Assert wrong state, missing code/client, changed returning client, replay, OAuth denial, five-minute timeout and abort are rejected. Sign test JWTs using a local test key: wrong nonce/signature/issuer/audience/expiry and missing direct-use scope must fail; verified identity determines the record ID and failed login cannot overwrite it.
- [ ] Write session tests with two separate Node processes accessing one temp store: an expired shared record causes one refresh, both read the rotated token, and writes preserve expiry/scopes. Assert logout prevents new work, clears every token even when revocation fails, retains client/host identity and returns `revoked:false` without provider error text. Abort must close the loopback listener and outstanding HTTP request.
- [ ] Run `npx vitest run tests/chatgpt-oauth.test.ts tests/chatgpt-session.test.ts`; expect failures before implementation.
- [ ] Implement temporary loopback HTTP callback and official discovery/JWKS verification using `jose`; refresh within 60 seconds of expiry under `withLock`, rereading after lock acquisition. Bound metadata/token responses to 1 MiB and requests to 30 seconds. Commit only verified identities and granted scopes. Logout cancels active account operations through the host before clearing tokens; revoke via discovery when available.
- [ ] Run targeted tests and typecheck; expect pass without real account credentials or live inference.
- [ ] Commit: `feat: authenticate and refresh local ChatGPT sessions`.

### Task 3: Implement model listing and completed Responses streams

**Files:** Create `helper/sse.ts`, `helper/openai.ts`, `tests/chatgpt-openai.test.ts`; reuse `src/groq/prompts.ts` and `src/groq/schema.ts` without changing Groq behavior.

**Interfaces:** Consume `SessionManager.accessToken`. Produce `readResponseText(body:ReadableStream<Uint8Array>,signal:AbortSignal):Promise<string>` and `OpenAIClient(sessions,fetcher)` methods `listModels(accountId,signal):Promise<ChatGPTModel[]>`, `summarize(accountId,model,text,signal):Promise<string>`, `explain(accountId,model,page,summary,selection,signal):Promise<Meaning>` (all identifiers/text are strings; page/selection use shared types).

- [ ] Write tests asserting models preserve API order and include only `visibility:"list"`, using `slug` as ID and `display_name` as label. Assert request Bearer token remains in helper, JSON has `store:false`, `stream:true`, `instructions` and user `input`; unsupported fields are absent. Valid TR/EN fixtures pass shared schema; malformed/missing summaries and equivalents fail.
- [ ] Add SSE fixtures split inside UTF-8 characters and delimiters, CRLF and multiline data, multiple events per chunk, successful completion, failed/incomplete events, malformed JSON, oversized streams and EOF before completion. Literal assertions include `await expect(disconnected).rejects.toMatchObject({code:"invalid_response"})` and one fetch call after HTTP 429. Sensitive fixture tokens/provider messages must never occur in returned errors.
- [ ] Run `npx vitest run tests/chatgpt-openai.test.ts`; expect failures before implementation.
- [ ] Implement requests to fixed official URLs with redirect rejection, credentials omitted, 90-second inference deadline, 2 MiB stream cap and 256 KiB accumulated output cap; abort/cancel readers on failure. Accumulate text deltas, accept only a completed terminal response, then run existing JSON/meaning validation; summary remains nonempty and at most 6000 characters. Map eligibility, quota, auth and transport failures to safe Turkish messages without retries.
- [ ] Run targeted tests and typecheck; expect pass.
- [ ] Commit: `feat: use official ChatGPT models and Responses streams`.

### Task 4: Deliver the executable native host and Linux installer

**Files:** Create `helper/framing.ts`, `helper/host.ts`, `scripts/build-helper.mjs`, `scripts/chatgpt-install.mjs`, `tests/chatgpt-host.test.ts`, `tests/chatgpt-install.test.ts`; modify `package.json` and `.gitignore`.

**Interfaces:** Consume Tasks 1–3. Produce `runHost({input,output,origin,allowedOrigin,store,...deps}):Promise<void>`; four-byte native-endian unsigned length framing, UTF-8 JSON, native requests capped at 512 KiB and replies at 512 KiB. Installer commands: `npm run chatgpt:install -- --browser <brave-origin|brave|chrome|chromium> --extension-id <32 a-p characters>` and `npm run chatgpt:uninstall -- --browser <...> --extension-id <id> [--delete-accounts]`. Testable installer functions receive an explicit home path; production uses the actual user home.

- [ ] Write framing tests for split headers/payloads, multiple messages, malformed JSON, oversized lengths, invalid/duplicate active IDs and commands, wrong origin, EOF and cancellation. Assert stdout contains only framed protocol and every public result is token-free; host disconnection aborts all pending work.
- [ ] Write installer tests for each browser's actual Linux NativeMessagingHosts path, private copied bundle/launcher, exact one-origin manifest and independent browser installs. Assert symlinks, foreign manifests, wrong extension IDs and unknown flags are refused before writes; repeated install/uninstall is safe; removing one browser keeps helper files needed by another, and accounts remain unless explicitly requested.
- [ ] Run both targeted test files; expect failures before implementation.
- [ ] Implement dispatch with schema/size validation, login event handling, per-request AbortControllers, logout account cancellation and disconnect cleanup. Bundle dependencies for Node 22 into a self-contained helper. Install versioned bundles and an executable launcher under `~/.local/share/manasi-nedir/`; embed absolute Node path and exact allowed origin in the launcher configuration. Maintain owned installation metadata; atomically install only owned targets and remove the shared bundle only after its last browser registration. Add `chatgpt:build`, `chatgpt:install`, `chatgpt:uninstall` scripts with concise noninteractive help and secret-free errors.
- [ ] Run targeted tests, `npm run chatgpt:build` and typecheck; expect pass. Feed a framed status command to the built host with a temporary store and verify its framed reply.
- [ ] Commit: `feat: install the ChatGPT native messaging helper on Linux`.

### Task 5: Connect the service worker to the helper

**Files:** Create `src/chatgpt/bridge.ts`, `src/chatgpt/client.ts`, `tests/chatgpt-bridge.test.ts`; modify `public/manifest.json`.

**Interfaces:** Consume native protocol. Produce `NativeBridge` with `request(command:NativeCommand,onAuthorize?:(url:string)=>Promise<void>):Promise<NativeValue>` and `disconnect():void`; a typed wrapper maps each command to its result. Produce `ChatGPTClient(bridge,accountId:string,model:string)` implementing existing summarize/explain client methods and `listModels():Promise<ModelOption[]>`. Extend `ModelOption` with optional `label:string`. The bridge does not request browser permissions itself.

- [ ] Write mocked-port tests for out-of-order replies, unknown IDs, malformed/event payloads, missing host, rejected native permission and disconnect rejecting every pending request. Authorize events can open only the exact trusted OpenAI origin/path, cannot include `id_token_hint`, and cannot arrive unsolicited. Assert tokens cannot pass the result validator and no hidden fallback fetch occurs.
- [ ] Run `npx vitest run tests/chatgpt-bridge.test.ts`; expect failures before implementation.
- [ ] Implement lazy reusable `connectNative`, runtime validators per command, disconnect cleanup and request deadlines (login 310 seconds, inference 100 seconds, status 10 seconds, other operations 45 seconds). On timeout send cancel when possible. Add optional `nativeMessaging` permission; keep existing Groq host/CSP permissions. No OpenAI HTTP browser permission is needed because only the helper calls OpenAI.
- [ ] Run targeted tests and typecheck; expect pass.
- [ ] Commit: `feat: bridge extension requests to the ChatGPT helper`.

### Task 6: Integrate provider settings, routing and context isolation

**Files:** Modify `src/shared/{types,messages}.ts`, `src/background/{settings,index,controller}.ts`, `src/context/cache.ts`, `src/groq/client.ts`; extend `tests/{settings,router,controller,context}.test.ts`.

**Interfaces:** Produce `GroqSettings={provider:"groq";apiKey:string;model:string;validated:true}`, `ChatGPTSettings={provider:"chatgpt";accountId:string;model:string;validated:true}` and `Settings=GroqSettings|ChatGPTSettings`. Store schema v2 keeps `active: "groq"|"chatgpt"|null` and separate provider records under trusted local storage. Keep `getSettings():Promise<Settings|null>` and Groq `validateAndSaveSettings(apiKey,model)`, add `activateChatGPT(accountId:string,model:string):Promise<void>`, `selectGroq():Promise<void>`, `clearChatGPT(accountId:string):Promise<void>`. GroqClient consumes only GroqSettings. Add token-free options-only messages for helper status/login/cancel/accounts/models/activation/logout; preserve existing Groq messages and popup/content authorization. `cacheKey(page,selection,settings)` includes provider, account (if ChatGPT) and model.

- [ ] Write tests migrating existing provider-less Groq settings once without losing the key, switching away/back without re-entry, and helpers missing while Groq is active. Assert failed model/account validation leaves active settings and generation unchanged; successful activation/logout synchronously cancels pending starts/explanations before awaited cleanup. Resolve an old request after switching and assert no display/cache insertion. Assert same page/word/model with two account IDs produces different cache keys and incomplete streams never populate cache. Content senders must be denied all new privileged commands.
- [ ] Run the four targeted test files; new cases should fail while existing cases remain meaningful.
- [ ] Implement settings migration and provider factory, preserve trusted storage and detached native fetch regression fix. Activation verifies the selected account's current model list before persistence, then invalidates contexts using existing `stopAll` generation reservation semantics. Cancel helper account requests on logout; serialize configuration mutations so overlapping saves cannot reorder active state. Replace Groq-specific missing-configuration copy with provider-neutral Turkish wording.
- [ ] Run targeted files plus `npm test` and typecheck; all existing Groq and new cases must pass.
- [ ] Commit: `feat: select providers and isolate ChatGPT account contexts`.

### Task 7: Finish settings UI, documentation and real native integration

**Files:** Modify `src/{options,popup}.ts`, `public/{options.html,popup.html,ui.css}`, `README.md`, `docs/manual-checks.md`, `docs/implementation-notes.md`, package/manifest version to `0.2.0`; create `tests/chatgpt-options.test.ts`, `e2e/chatgpt-native.spec.ts`; update existing browser fixtures for settings union.

**Interfaces:** Consume Task 6 messages. UI requests optional native permission directly from the explicit connection click, then starts login; validated authorize events open a tab in the current browser. Browser storage retains no auth tokens. Account/model labels use textContent. Installation command displays actual `chrome.runtime.id` with browser selection and Node 22 requirement.

- [ ] Write DOM tests covering preserved Groq form, missing-helper instructions, exact **Continue with ChatGPT** label, permission denial, cancellation, account/workspace picker, separate same-email client suffixes, model display labels, failed activation, logout/revocation notice and truthful provider text in popup. Assert a permission request occurs only on an explicit connection click, and activation is unavailable until account/model validation succeeds.
- [ ] Write Chromium integration using a temporary user home/profile and the actual bundled/installed host: verify `connectNative` status, correctly framed replies and disconnect behavior. Inject fake OAuth/OpenAI dependencies only into a separate test host bundle, never runtime flags in the production helper; use it to test login events, models, contextual definition, partial-stream failure and logout through the browser UI. Preserve existing real-browser Groq regression.
- [ ] Run targeted DOM/browser tests; expect new cases to fail before UI integration.
- [ ] Implement UI and version bump. Document Linux install/uninstall, browser extension ID, accounts, supported models, plan eligibility/limits, local file permissions and explicit account deletion. Explain that automated fixtures cannot establish real ChatGPT plan eligibility; add user-assisted live login/model/definition/logout checklist and separate Groq TPM guidance with official links.
- [ ] Run `npm run typecheck`, `npm test`, `npm run chatgpt:build`, `npm run test:e2e`; require all pass. Check built browser assets contain no helper credentials/Node modules. Inspect actual Brave options with the browser skill; ask user only to perform their private sign-in if required, then verify visible model/definition result without reading tokens.
- [ ] Commit: `feat: expose ChatGPT sign-in and document native setup`.

## Final review and delivery

- [ ] Run the required single independent whole-branch review for the preserved inline workflow; fix material findings and rerun affected checks.
- [ ] Report separately what passed automatically, whether actual user sign-in/inference was verified, and any external eligibility blocker. Do not claim a mocked OAuth test proves subscription use.
- [ ] Follow the user's existing local-integration preference after checks; do not publish or push without authorization.

## Plan self-review

Spec coverage: storage/OAuth/session in Tasks 1–2; API and stream semantics in Task 3; origin/framing/installer in Task 4; token-free bridge in Task 5; migration/context/cache in Task 6; UI/Linux docs/real-browser verification in Task 7. All five Review Focus cases have named assertions in their owning tasks. Contracts, command names and settings discriminants are shared across tasks; test-only endpoint injection never becomes user-controlled production configuration.
