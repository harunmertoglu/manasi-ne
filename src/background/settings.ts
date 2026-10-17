import { GroqClient } from "../groq/client";
import { AppError, type Settings, type StorageArea } from "../shared/types";
export class SettingsStore {
  constructor(
    private area: StorageArea,
    private factory: (s: Settings) => { verify(): Promise<void> } = (s) =>
      new GroqClient(s),
  ) {}
  async initialize() {
    await this.area.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  async getSettings(): Promise<Settings | null> {
    const { settings } = await this.area.get("settings");
    return settings?.validated === true &&
      typeof settings.apiKey === "string" &&
      typeof settings.model === "string"
      ? settings
      : null;
  }
  async validateAndSaveSettings(apiKey: string, model: string): Promise<void> {
    const key = apiKey.trim() || (await this.getSettings())?.apiKey;
    if (!key)
      throw new AppError(
        "missing_key",
        "Önce kendi Groq API anahtarınızı girin.",
      );
    const settings = { apiKey: key, model, validated: true };
    await this.factory(settings).verify();
    await this.area.set({ settings });
  }
  async clearSettings(): Promise<void> {
    await this.area.remove("settings");
  }
}
