"use client";
import { useEffect, useRef } from "react";
import type { TranscriptChunk } from "@/lib/types";

interface Props {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function TranscriptPanel({
  chunks,
  isRecording,
  isTranscribing,
  error,
  onStart,
  onStop,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          1. Mic &amp; Transcript
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            isRecording
              ? "text-red-400 border-red-400/30 bg-red-400/10"
              : "text-white/30 border-white/10"
          }`}
        >
          {isRecording ? "● Recording" : "Idle"}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 pt-6 pb-5 px-4 border-b border-white/8">
        <button
          onClick={isRecording ? onStop : onStart}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 animate-pulse"
              : "bg-white/10 hover:bg-white/15 border border-white/20"
          }`}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V22H9v2h6v-2h-2v-1.06A9 9 0 0 0 21 12v-2h-2z" />
            </svg>
          )}
        </button>
        <p className="text-xs text-white/40 text-center">
          {isRecording
            ? "Recording — transcript appends every ~30s"
            : "Click mic to start. Transcript appends every ~30s."}
        </p>
        {isTranscribing && (
          <p className="text-[10px] text-blue-400 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
            Transcribing…
          </p>
        )}
        {error && <p className="text-[10px] text-red-400 text-center">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {chunks.length === 0 ? (
          <p className="text-xs text-white/25 italic text-center mt-8">
            No transcript yet — start the mic.
          </p>
        ) : (
          chunks.map((chunk) => (
            <div key={chunk.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[9px] font-mono text-white/30 shrink-0">
                  {new Date(chunk.timestamp).toLocaleTimeString()}
                </span>
                <div className="flex-1 h-px bg-white/8" />
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{chunk.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
