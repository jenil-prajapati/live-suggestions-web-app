"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSettings } from "@/hooks/useSettings";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { SettingsModal } from "@/components/SettingsModal";
import type {
  TranscriptChunk,
  SuggestionBatch,
  Suggestion,
  ChatMessage,
  ExportSession,
} from "@/lib/types";

export default function Home() {
  const { settings, updateSettings, loaded } = useSettings();

  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [noApiKeyWarning, setNoApiKeyWarning] = useState(false);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  // Points to the latest fetchSuggestions so setInterval never captures a stale closure.
  const fetchSuggestionsRef = useRef<() => Promise<void>>(async () => {});

  const fullTranscript = transcriptChunks.map((c) => c.text).join(" ");
  const recentTranscript = (chars: number) => fullTranscript.slice(-chars);

  const transcribeChunk = useCallback(
    async (blob: Blob) => {
      if (!settings.groqApiKey) return;
      setIsTranscribing(true);
      setTranscribeError(null);
      try {
        // Whisper rejects MIME types with codec suffixes (e.g. audio/webm;codecs=opus).
        const baseMime = blob.type.split(";")[0];
        const ext = baseMime.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `audio.${ext}`, { type: baseMime });
        const fd = new FormData();
        fd.append("audio", file);
        fd.append("apiKey", settings.groqApiKey);
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.text?.trim()) {
          setTranscriptChunks((prev) => [
            ...prev,
            { id: `${Date.now()}`, text: data.text.trim(), timestamp: Date.now() },
          ]);
        }
      } catch (err) {
        setTranscribeError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings.groqApiKey]
  );

  const fetchSuggestions = useCallback(async () => {
    const transcript = recentTranscript(settings.suggestionContextChars);
    if (!transcript.trim()) return;
    if (!settings.groqApiKey) {
      setNoApiKeyWarning(true);
      return;
    }
    setIsSuggestionsLoading(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          prompt: settings.suggestionPrompt,
          apiKey: settings.groqApiKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.suggestions?.length) {
        setSuggestionBatches((prev) => [
          ...prev,
          { id: `${Date.now()}`, timestamp: Date.now(), suggestions: data.suggestions },
        ]);
      }
    } catch (err) {
      console.error("Suggestions error:", err);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [settings, recentTranscript]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSuggestionsRef.current = fetchSuggestions;
  }, [fetchSuggestions]);

  const startRefreshLoop = useCallback(() => {
    const interval = settings.refreshIntervalMs;
    setNextRefreshIn(interval);

    refreshTimerRef.current = setInterval(() => {
      if (isRecordingRef.current) fetchSuggestionsRef.current();
    }, interval);

    countdownRef.current = setInterval(() => {
      setNextRefreshIn((prev) => (prev <= 1000 ? interval : prev - 1000));
    }, 1000);
  }, [settings.refreshIntervalMs]);

  const stopRefreshLoop = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    refreshTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const { isRecording, error: micError, start: startMic, stop: stopMic, flush: flushAudio } = useAudioRecorder({
    onChunk: transcribeChunk,
    chunkIntervalMs: 30000,
  });

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const handleStart = useCallback(() => {
    if (!settings.groqApiKey) {
      setNoApiKeyWarning(true);
      setShowSettings(true);
      return;
    }
    setNoApiKeyWarning(false);
    startMic();
    startRefreshLoop();
  }, [settings.groqApiKey, startMic, startRefreshLoop]);

  const handleStop = useCallback(() => {
    stopMic();
    stopRefreshLoop();
  }, [stopMic, stopRefreshLoop]);

  useEffect(() => () => stopRefreshLoop(), [stopRefreshLoop]);

  const handleManualRefresh = useCallback(async () => {
    if (isRecordingRef.current) {
      await flushAudio();
    }
    await fetchSuggestionsRef.current();
    setNextRefreshIn(settings.refreshIntervalMs);
  }, [flushAudio, settings.refreshIntervalMs]);

  const handleChatSend = useCallback(
    async (text: string, suggestion?: Suggestion) => {
      if (!settings.groqApiKey) {
        setNoApiKeyWarning(true);
        setShowSettings(true);
        return;
      }
      const effectiveContent = suggestion?.text || text;
      if (!effectiveContent?.trim()) return;

      const typeLabels: Record<string, string> = {
        question_to_ask: "Question to ask",
        talking_point: "Talking point",
        answer: "Answer",
        fact_check: "Fact-check",
        clarification: "Clarification",
      };
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: suggestion
          ? text ? `${suggestion.text}\n\n${text}` : suggestion.text
          : text,
        timestamp: Date.now(),
        suggestionRef: suggestion ? typeLabels[suggestion.type] : undefined,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent("");

      const transcript = recentTranscript(settings.detailedAnswerContextChars);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            chatHistory: chatMessages.slice(-10),
            userMessage: userMsg.content,
            prompt: settings.chatPrompt,
            apiKey: settings.groqApiKey,
            suggestionContext: suggestion
              ? { type: suggestion.type, text: suggestion.text }
              : null,
            detailedAnswerPrompt: suggestion ? settings.detailedAnswerPrompt : undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6);
              if (payload === "[DONE]") break;
              try {
                const { delta } = JSON.parse(payload);
                full += delta;
                setStreamingContent(full);
              } catch {
                /* skip malformed SSE frames */
              }
            }
          }
        }

        setChatMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: full, timestamp: Date.now() },
        ]);
      } catch (err) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [settings, chatMessages, recentTranscript] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Clicking a suggestion sends it as-is; passing "" avoids duplicating the text.
  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => handleChatSend("", suggestion),
    [handleChatSend]
  );

  const handleExport = () => {
    const session: ExportSession = {
      exportedAt: new Date().toISOString(),
      transcript: transcriptChunks.map((c) => ({
        timestamp: new Date(c.timestamp).toISOString(),
        text: c.text,
      })),
      suggestionBatches: suggestionBatches.map((b) => ({
        timestamp: new Date(b.timestamp).toISOString(),
        suggestions: b.suggestions.map((s) => ({ type: s.type, text: s.text })),
      })),
      chat: chatMessages.map((m) => ({
        timestamp: new Date(m.timestamp).toISOString(),
        role: m.role,
        content: m.content,
      })),
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinmind-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loaded) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V22H9v2h6v-2h-2v-1.06A9 9 0 0 0 21 12v-2h-2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white/90">TwinMind</span>
          <span className="text-[10px] text-white/30 bg-white/6 px-1.5 py-0.5 rounded">Live Suggestions</span>
        </div>
        <div className="flex items-center gap-2">
          {noApiKeyWarning && (
            <span className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md">
              Paste your Groq API key in Settings to continue
            </span>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 bg-white/6 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-md transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 bg-white/6 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-md transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-[28%] border-r border-white/8 flex flex-col min-h-0">
          <TranscriptPanel
            chunks={transcriptChunks}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            error={micError || transcribeError}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>

        <div className="w-[35%] border-r border-white/8 flex flex-col min-h-0">
          <SuggestionsPanel
            batches={suggestionBatches}
            isLoading={isSuggestionsLoading}
            nextRefreshIn={nextRefreshIn}
            onRefresh={handleManualRefresh}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <ChatPanel
            messages={chatMessages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            onSend={(text) => handleChatSend(text)}
          />
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
