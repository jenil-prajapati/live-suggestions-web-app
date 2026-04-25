"use client";
import { useState, useEffect } from "react";
import type { SessionSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const STORAGE_KEY = "twinmind_settings";
// Bump this when prompts change so old localStorage values are replaced
const SETTINGS_VERSION = 2;
const VERSION_KEY = "twinmind_settings_version";

export function useSettings() {
  const [settings, setSettings] = useState<SessionSettings>({
    groqApiKey: "",
    ...DEFAULT_SETTINGS,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedVersion = Number(localStorage.getItem(VERSION_KEY) ?? "0");
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored && storedVersion >= SETTINGS_VERSION) {
        // Version matches — merge stored values (preserves API key + custom overrides)
        setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
      } else if (stored && storedVersion < SETTINGS_VERSION) {
        // Prompts changed — keep API key but reset prompts to new defaults
        const parsed = JSON.parse(stored) as Partial<SessionSettings>;
        setSettings((prev) => ({
          ...prev,
          ...DEFAULT_SETTINGS, // new prompt defaults win
          groqApiKey: parsed.groqApiKey ?? "", // preserve the key
        }));
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      } else {
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const updateSettings = (updates: Partial<SessionSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return { settings, updateSettings, loaded };
}
