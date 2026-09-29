import type { QueueSettings } from "@/lib/settings/types";
import { defaultSettings, settingsStorageKey } from "@/lib/settings/types";

export function loadLocalSettings(): QueueSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const saved = window.localStorage.getItem(settingsStorageKey);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveLocalSettings(settings: QueueSettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}
