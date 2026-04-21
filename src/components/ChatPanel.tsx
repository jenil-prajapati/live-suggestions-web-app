"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, isStreaming, streamingContent, onSend }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          3. Chat (Detailed Answers)
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25 border border-white/10 px-2 py-0.5 rounded-full">
          Session-only
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <p className="text-xs text-white/25 italic text-center mt-8">
            Click a suggestion or type a question below.
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`rounded-lg px-3 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-white/8 border border-white/10"
                : "bg-transparent"
            }`}>
              {msg.role === "user" ? (
                <>
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-1.5">
                    You{msg.suggestionRef ? ` · ${msg.suggestionRef}` : ""}
                  </p>
                  <p className="text-white/85 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-1.5">Assistant</p>
                  <p className="text-white/80 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </>
              )}
              <p className="text-[10px] mt-1.5 text-white/20">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {/* Streaming assistant message */}
        {isStreaming && (
          <div>
            <div className="rounded-lg px-3 py-2.5 text-sm">
              <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-1.5">Assistant</p>
              {streamingContent ? (
                <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1.5 h-4 bg-white/60 ml-0.5 animate-pulse align-text-bottom" />
                </p>
              ) : (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/8 px-4 py-3">
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            className="flex-1 bg-white/6 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all min-h-[38px] max-h-32"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
