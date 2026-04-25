"use client";
import { useEffect, useRef, useState } from "react";
import type { Suggestion, SuggestionBatch } from "@/lib/types";
import { SuggestionCard } from "./SuggestionCard";

interface Props {
  batches: SuggestionBatch[];
  isLoading: boolean;
  nextRefreshIn: number;
  onRefresh: () => void;
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export function SuggestionsPanel({
  batches,
  isLoading,
  nextRefreshIn,
  onRefresh,
  onSuggestionClick,
}: Props) {
  const topRef = useRef<HTMLDivElement>(null);
  const [prevBatchCount, setPrevBatchCount] = useState(0);

  useEffect(() => {
    if (batches.length > prevBatchCount) {
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      setPrevBatchCount(batches.length);
    }
  }, [batches.length, prevBatchCount]);

  const seconds = Math.ceil(nextRefreshIn / 1000);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          2. Live Suggestions
        </span>
        <span className="text-[10px] text-white/30 font-medium">
          {batches.length} {batches.length === 1 ? "batch" : "batches"}
        </span>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 disabled:opacity-40 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.3M20 15a9 9 0 0 1-15 4.3"
            />
          </svg>
          {isLoading ? "Refreshing…" : "Reload suggestions"}
        </button>
        <span className="text-[10px] text-white/25">
          {isLoading ? "loading…" : `auto-refresh in ${seconds}s`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div ref={topRef} />
        {batches.length === 0 ? (
          <p className="text-xs text-white/25 italic text-center mt-8">
            Suggestions appear here once recording starts.
          </p>
        ) : (
          [...batches].reverse().map((batch, batchIdx) => (
            <div key={batch.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[9px] font-mono text-white/25 shrink-0">
                  {`— BATCH ${batches.length - batchIdx} · ${new Date(batch.timestamp).toLocaleTimeString()} —`}
                </span>
                <div className="flex-1 h-px bg-white/8" />
              </div>
              <div className="space-y-1.5">
                {batch.suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onClick={onSuggestionClick}
                    faded={batchIdx > 0}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
