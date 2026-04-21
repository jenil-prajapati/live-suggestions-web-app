"use client";
import type { Suggestion, SuggestionType } from "@/lib/types";

const TYPE_CONFIG: Record<SuggestionType, { label: string; color: string }> = {
  question_to_ask: { label: "Question to ask", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  talking_point:   { label: "Talking point",   color: "text-green-400 bg-green-400/10 border-green-400/20" },
  answer:          { label: "Answer",           color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  fact_check:      { label: "Fact-check",       color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  clarification:   { label: "Clarification",    color: "text-teal-400 bg-teal-400/10 border-teal-400/20" },
};

interface Props {
  suggestion: Suggestion;
  onClick: (suggestion: Suggestion) => void;
  faded?: boolean;
}

export function SuggestionCard({ suggestion, onClick, faded = false }: Props) {
  const config = TYPE_CONFIG[suggestion.type] ?? TYPE_CONFIG.talking_point;

  return (
    <button
      onClick={() => suggestion.text && onClick(suggestion)}
      disabled={!suggestion.text}
      className={`w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 active:scale-[0.99] transition-all duration-150 px-3 py-2.5 group disabled:cursor-not-allowed ${
        faded ? "opacity-45 hover:opacity-70" : ""
      }`}
    >
      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border mb-2 ${config.color}`}>
        {config.label}
      </span>
      {suggestion.text ? (
        <p className="text-sm text-white/85 leading-snug">{suggestion.text}</p>
      ) : (
        <p className="text-xs text-white/25 italic">Loading…</p>
      )}
    </button>
  );
}
