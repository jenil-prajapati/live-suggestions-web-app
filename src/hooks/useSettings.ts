"use client";
import { useState, useEffect } from "react";
import type { SessionSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const STORAGE_KEY = "twinmind_settings";

export function useSettings() {
  const [settings, setSettings] = useState<SessionSettings>({
    groqApiKey: "",
    ...DEFAULT_SETTINGS,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
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
      } catch {
        // ignore
      }
      return next;
    });
  };

  return { settings, updateSettings, loaded };
}
