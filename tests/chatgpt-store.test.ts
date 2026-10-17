// @vitest-environment node
import { chmod, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { CredentialStore } from "../helper/store";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "manasi-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("creates a 0700 directory, writes 0600 secret files atomically, and persists a stable host-id", async () => {
  const root = await makeTempDir();
  const storeDir = path.join(root, "chatgpt");
  const store = new CredentialStore(storeDir);

  const hostId1 = await store.getOrCreateHostId();
  const hostId2 = await store.getOrCreateHostId();
  expect(hostId1).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
  expect(hostId2).toBe(hostId1);

  const dirStat = await lstat(storeDir);
  expect(dirStat.mode & 0o777).toBe(0o700);

  await store.writeSecret({
    accountId: "acct_1",
    clientId: "client_1",
    accessToken: "at_secret",
    refreshToken: "rt_secret",
    expiresAt: Date.now() + 60_000,
    grantedScopes: ["openid", "chatgpt.tokens.use.direct"],
  });

  const secretStat = await lstat(path.join(storeDir, "acct_1.secret.json"));
  expect(secretStat.mode & 0o777).toBe(0o600);

  const loaded = await store.readSecret("acct_1");
  expect(loaded?.refreshToken).toBe("rt_secret");
});

it("refuses to read a secret file whose permissions were widened to world-readable", async () => {
  const root = await makeTempDir();
  const storeDir = path.join(root, "chatgpt");
  const store = new CredentialStore(storeDir);

  await store.writeSecret({
    accountId: "acct_1",
    clientId: "client_1",
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: Date.now() + 60_000,
    grantedScopes: [],
  });
  await chmod(path.join(storeDir, "acct_1.secret.json"), 0o644);

  await expect(store.readSecret("acct_1")).rejects.toMatchObject({
    code: "unsafe_storage",
  });
});

it("rejects symlinked store directories", async () => {
  const root = await makeTempDir();
  const realDir = path.join(root, "real");
  const linkDir = path.join(root, "link");
  await writeFile(realDir, "not-a-dir");
  await symlink(realDir, linkDir);

  const store = new CredentialStore(linkDir);
  await expect(store.getOrCreateHostId()).rejects.toMatchObject({
    code: "unsafe_storage",
  });
});

it("serializes concurrent refresh lock holders", async () => {
  const root = await makeTempDir();
  const store = new CredentialStore(path.join(root, "chatgpt"));
  const order: string[] = [];

  await Promise.all([
    store.withRefreshLock(async () => {
      order.push("first-start");
      await new Promise((r) => setTimeout(r, 40));
      order.push("first-end");
    }),
    store.withRefreshLock(async () => {
      order.push("second-start");
      order.push("second-end");
    }),
  ]);

  expect(order).toEqual([
    "first-start",
    "first-end",
    "second-start",
    "second-end",
  ]);
});
