"use client";
import { useState, useEffect } from "react";
import type { SessionSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const STORAGE_KEY = "twinmind_settings";
const VERSION_KEY = "twinmind_settings_version";
// Bump whenever prompt defaults change so stale prompts in localStorage are replaced.
const SETTINGS_VERSION = 6;

export function useSettings() {
  const [settings, setSettings] = useState<SessionSettings>({
    groqApiKey: "",
    ...DEFAULT_SETTINGS,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Mount-time hydration from localStorage. setState-in-effect is correct
    // here — React state has to be initialised from a side-effectful source
    // exactly once on the client.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const storedVersion = Number(localStorage.getItem(VERSION_KEY) ?? "0");
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored && storedVersion >= SETTINGS_VERSION) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
      } else if (stored && storedVersion < SETTINGS_VERSION) {
        // Keep the user's API key, but swap prompts for the new defaults.
        const parsed = JSON.parse(stored) as Partial<SessionSettings>;
        setSettings((prev) => ({
          ...prev,
          ...DEFAULT_SETTINGS,
          groqApiKey: parsed.groqApiKey ?? "",
        }));
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      } else {
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      }
    } catch {
      /* localStorage unavailable — fall back to defaults */
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const updateSettings = (updates: Partial<SessionSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  };

  return { settings, updateSettings, loaded };
}
