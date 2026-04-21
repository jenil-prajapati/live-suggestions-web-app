"use client";
import { useState } from "react";
import type { SessionSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import {
  DEFAULT_SUGGESTION_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_CHAT_PROMPT,
} from "@/lib/prompts";

interface Props {
  settings: SessionSettings;
  onSave: (updates: Partial<SessionSettings>) => void;
  onClose: () => void;
}

type Tab = "api" | "prompts" | "context";

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<SessionSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<Tab>("api");

  const set = (key: keyof SessionSettings, value: string | number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const resetPrompts = () => {
    setDraft((prev) => ({
      ...prev,
      suggestionPrompt: DEFAULT_SUGGESTION_PROMPT,
      detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
      chatPrompt: DEFAULT_CHAT_PROMPT,
      suggestionContextChars: DEFAULT_SETTINGS.suggestionContextChars,
      detailedAnswerContextChars: DEFAULT_SETTINGS.detailedAnswerContextChars,
      refreshIntervalMs: DEFAULT_SETTINGS.refreshIntervalMs,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/12 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {(["api", "prompts", "context"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-white border-b-2 border-blue-500"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {tab === "api" ? "API Key" : tab === "context" ? "Context & Timing" : "Prompts"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {activeTab === "api" && (
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Groq API Key</label>
              <input
                type="password"
                value={draft.groqApiKey}
                onChange={(e) => set("groqApiKey", e.target.value)}
                placeholder="gsk_..."
                className="w-full bg-white/6 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 font-mono"
              />
              <p className="text-[11px] text-white/30 mt-2">
                Your key is stored only in your browser&apos;s localStorage and never sent anywhere except the Groq API.
              </p>
            </div>
          )}

          {activeTab === "prompts" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button onClick={resetPrompts} className="text-[11px] text-white/40 hover:text-white/70 underline">
                  Reset all to defaults
                </button>
              </div>
              <PromptField
                label="Live Suggestions Prompt"
                hint="Use {transcript} as placeholder for the transcript window."
                value={draft.suggestionPrompt}
                onChange={(v) => set("suggestionPrompt", v)}
                rows={10}
              />
              <PromptField
                label="Detailed Answer Prompt (on suggestion click)"
                hint="Placeholders: {transcript}, {suggestion_type}, {suggestion_text}"
                value={draft.detailedAnswerPrompt}
                onChange={(v) => set("detailedAnswerPrompt", v)}
                rows={8}
              />
              <PromptField
                label="Chat Prompt (direct messages)"
                hint="Used when the user types a message directly. Use {transcript} as placeholder."
                value={draft.chatPrompt}
                onChange={(v) => set("chatPrompt", v)}
                rows={6}
              />
            </div>
          )}

          {activeTab === "context" && (
            <div className="space-y-5">
              <NumberField
                label="Suggestion context window (chars)"
                hint="How many recent transcript characters to pass when generating suggestions."
                value={draft.suggestionContextChars}
                onChange={(v) => set("suggestionContextChars", v)}
                min={500}
                max={20000}
                step={500}
              />
              <NumberField
                label="Detailed answer context window (chars)"
                hint="How many transcript characters to include for expanded chat answers."
                value={draft.detailedAnswerContextChars}
                onChange={(v) => set("detailedAnswerContextChars", v)}
                min={500}
                max={40000}
                step={500}
              />
              <NumberField
                label="Auto-refresh interval (seconds)"
                hint="How often suggestions auto-refresh while recording."
                value={Math.round(draft.refreshIntervalMs / 1000)}
                onChange={(v) => set("refreshIntervalMs", v * 1000)}
                min={10}
                max={120}
                step={5}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptField({
  label,
  hint,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-1">{label}</label>
      <p className="text-[11px] text-white/30 mb-1.5">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-white/6 border border-white/12 rounded-lg px-3 py-2 text-xs text-white/80 font-mono resize-y focus:outline-none focus:border-blue-500/50 leading-relaxed"
      />
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-1">{label}</label>
      <p className="text-[11px] text-white/30 mb-1.5">{hint}</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-blue-500"
        />
        <span className="text-sm text-white/70 w-16 text-right tabular-nums">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}
