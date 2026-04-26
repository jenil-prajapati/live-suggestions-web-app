"use client";
import { useCallback, useState } from "react";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useSettings } from "@/hooks/useSettings";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { buildExportSession, downloadSession } from "@/lib/export";
import type { Suggestion, SuggestionBatch } from "@/lib/types";

export default function Home() {
  const { settings, updateSettings, loaded } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [noApiKeyWarning, setNoApiKeyWarning] = useState(false);

  const handleMissingApiKey = useCallback(() => {
    setNoApiKeyWarning(true);
    setShowSettings(true);
  }, []);

  const session = useLiveSession({ settings, onMissingApiKey: handleMissingApiKey });

  // Find the batch a clicked suggestion belongs to so we can record the link.
  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion) => {
      const batch = session.suggestionBatches.find((b: SuggestionBatch) =>
        b.suggestions.some((s) => s.id === suggestion.id)
      );
      session.clickSuggestion(suggestion, batch?.id ?? "");
    },
    [session]
  );

  const handleStart = useCallback(() => {
    if (!settings.groqApiKey) {
      handleMissingApiKey();
      return;
    }
    setNoApiKeyWarning(false);
    session.start();
  }, [handleMissingApiKey, session, settings.groqApiKey]);

  const handleExport = useCallback(() => {
    const exportData = buildExportSession({
      sessionStartedAt: session.sessionStartedAt,
      transcriptChunks: session.transcriptChunks,
      suggestionBatches: session.suggestionBatches,
      chatMessages: session.chatMessages,
    });
    downloadSession(exportData);
  }, [session]);

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
            chunks={session.transcriptChunks}
            isRecording={session.isRecording}
            isTranscribing={session.isTranscribing}
            error={session.micError || session.transcribeError}
            onStart={handleStart}
            onStop={session.stop}
          />
        </div>

        <div className="w-[35%] border-r border-white/8 flex flex-col min-h-0">
          <SuggestionsPanel
            batches={session.suggestionBatches}
            isLoading={session.isSuggestionsLoading}
            nextRefreshIn={session.nextRefreshIn}
            onRefresh={session.manualRefresh}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <ChatPanel
            messages={session.chatMessages}
            isStreaming={session.isStreaming}
            streamingContent={session.streamingContent}
            onSend={session.sendChat}
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
