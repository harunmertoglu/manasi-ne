import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChatGPTAccountSummary, HelperErrorCode } from "../src/shared/chatgpt";

export class HelperError extends Error {
  constructor(
    public readonly code: HelperErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface StoredAccountsFile {
  activeAccountId?: string;
  registeredClientId?: string;
  accounts: ChatGPTAccountSummary[];
}

export interface StoredTokenSecret {
  accountId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
  grantedScopes: string[];
}

export function defaultStoreDir(): string {
  const override = process.env.MANASI_CHATGPT_HOME?.trim();
  if (override) return path.resolve(override);
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "ManasiNedir",
      "chatgpt",
    );
  }
  const xdg =
    process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(xdg, "manasi-nedir", "chatgpt");
}

function assertSafeAccountId(accountId: string): void {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(accountId)) {
    throw new HelperError("unsafe_storage", "Geçersiz hesap kimliği.");
  }
}

export class CredentialStore {
  constructor(public readonly dir: string = defaultStoreDir()) {}

  async ensureSafeDir(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
        throw new HelperError(
          "unsafe_storage",
          "Kimlik bilgisi klasörü oluşturulamadı.",
        );
      }
    }
    const info = await lstat(this.dir);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new HelperError(
        "unsafe_storage",
        "Kimlik bilgisi klasörü sembolik bağlantı olamaz.",
      );
    }
    if (
      typeof process.getuid === "function" &&
      info.uid !== process.getuid()
    ) {
      throw new HelperError(
        "unsafe_storage",
        "Kimlik bilgisi klasörü başka bir kullanıcıya ait.",
      );
    }
    if ((info.mode & 0o077) !== 0) {
      await chmod(this.dir, 0o700);
      const after = await stat(this.dir);
      if ((after.mode & 0o077) !== 0) {
        throw new HelperError(
          "unsafe_storage",
          "Kimlik bilgisi klasörü izinleri güvenli değil.",
        );
      }
    }
  }

  private async verifySafeFile(filePath: string): Promise<void> {
    const info = await lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new HelperError(
        "unsafe_storage",
        "Kimlik bilgisi dosyası sembolik bağlantı olamaz.",
      );
    }
    if (
      typeof process.getuid === "function" &&
      info.uid !== process.getuid()
    ) {
      throw new HelperError(
        "unsafe_storage",
        "Kimlik bilgisi dosyası başka bir kullanıcıya ait.",
      );
    }
    if ((info.mode & 0o077) !== 0) {
      throw new HelperError(
        "unsafe_storage",
        "Kimlik bilgisi dosyası izinleri güvenli değil (0600 olmalı).",
      );
    }
  }

  private async atomicWriteJson(
    filePath: string,
    value: unknown,
  ): Promise<void> {
    await this.ensureSafeDir();
    const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const payload = JSON.stringify(value, null, 2);
    await writeFile(tmp, payload, { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, filePath);
  }

  async getOrCreateHostId(): Promise<string> {
    await this.ensureSafeDir();
    const file = path.join(this.dir, "host-id");
    try {
      await this.verifySafeFile(file);
      const existing = (await readFile(file, "utf8")).trim();
      if (/^urn:uuid:[0-9a-f-]{36}$/i.test(existing)) return existing;
    } catch (error) {
      if (error instanceof HelperError) throw error;
    }
    const created = `urn:uuid:${randomUUID()}`;
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${created}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, file);
    return created;
  }

  async readAccounts(): Promise<StoredAccountsFile> {
    await this.ensureSafeDir();
    const file = path.join(this.dir, "accounts.json");
    try {
      await this.verifySafeFile(file);
      const raw = JSON.parse(
        await readFile(file, "utf8"),
      ) as StoredAccountsFile;
      return {
        activeAccountId:
          typeof raw?.activeAccountId === "string"
            ? raw.activeAccountId
            : undefined,
        registeredClientId:
          typeof raw?.registeredClientId === "string"
            ? raw.registeredClientId
            : undefined,
        accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { accounts: [] };
      }
      if (error instanceof HelperError) throw error;
      throw new HelperError(
        "unsafe_storage",
        "Hesap üstverisi okunamadı veya bozulmuş.",
      );
    }
  }

  async writeAccounts(data: StoredAccountsFile): Promise<void> {
    await this.atomicWriteJson(path.join(this.dir, "accounts.json"), data);
  }

  async readSecret(accountId: string): Promise<StoredTokenSecret | null> {
    assertSafeAccountId(accountId);
    await this.ensureSafeDir();
    const file = path.join(this.dir, `${accountId}.secret.json`);
    try {
      await this.verifySafeFile(file);
      return JSON.parse(await readFile(file, "utf8")) as StoredTokenSecret;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      if (error instanceof HelperError) throw error;
      throw new HelperError("unsafe_storage", "Oturum anahtarı okunamadı.");
    }
  }

  async writeSecret(secret: StoredTokenSecret): Promise<void> {
    assertSafeAccountId(secret.accountId);
    await this.atomicWriteJson(
      path.join(this.dir, `${secret.accountId}.secret.json`),
      secret,
    );
  }

  async deleteSecret(accountId: string): Promise<void> {
    assertSafeAccountId(accountId);
    await rm(path.join(this.dir, `${accountId}.secret.json`), { force: true });
  }

  async withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureSafeDir();
    const lockFile = path.join(this.dir, "refresh.lock");
    const deadline = Date.now() + 10_000;
    const staleThresholdMs = 30_000;

    while (true) {
      try {
        const handle = await open(lockFile, "wx", 0o600);
        try {
          await handle.writeFile(
            JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
            "utf8",
          );
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
          throw error;
        }
        try {
          const info = await stat(lockFile);
          if (Date.now() - info.mtimeMs > staleThresholdMs) {
            await rm(lockFile, { force: true });
            continue;
          }
        } catch {
          // Lock file was already removed between EEXIST and stat
          continue;
        }
        if (Date.now() >= deadline) {
          throw new HelperError(
            "timeout",
            "Oturum yenileme kilidi zaman aşımına uğradı.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    try {
      return await fn();
    } finally {
      await rm(lockFile, { force: true });
    }
  }
}
