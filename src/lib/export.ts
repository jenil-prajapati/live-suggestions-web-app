import type {
  ChatMessage,
  ExportSession,
  SuggestionBatch,
  TranscriptChunk,
} from "./types";

export const APP_VERSION = "1.0.0";

interface BuildArgs {
  sessionStartedAt: number | null;
  transcriptChunks: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatMessages: ChatMessage[];
}

/**
 * Builds the export payload. Marks which suggestions were clicked by
 * cross-referencing the chat messages, so reviewers can trace clicks back
 * to the batch they came from.
 */
export function buildExportSession({
  sessionStartedAt,
  transcriptChunks,
  suggestionBatches,
  chatMessages,
}: BuildArgs): ExportSession {
  const clickedSuggestionIds = new Set(
    chatMessages.map((m) => m.suggestionId).filter((id): id is string => Boolean(id))
  );

  return {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    sessionStartedAt: sessionStartedAt ? new Date(sessionStartedAt).toISOString() : null,
    transcript: transcriptChunks.map((c) => ({
      id: c.id,
      timestamp: new Date(c.timestamp).toISOString(),
      text: c.text,
    })),
    suggestionBatches: suggestionBatches.map((b) => ({
      id: b.id,
      timestamp: new Date(b.timestamp).toISOString(),
      basedOnChunkId: b.basedOnChunkId,
      suggestions: b.suggestions.map((s) => ({
        id: s.id,
        type: s.type,
        text: s.text,
        clicked: clickedSuggestionIds.has(s.id),
      })),
    })),
    chat: chatMessages.map((m) => ({
      id: m.id,
      timestamp: new Date(m.timestamp).toISOString(),
      role: m.role,
      content: m.content,
      suggestionBatchId: m.suggestionBatchId,
      suggestionId: m.suggestionId,
    })),
  };
}

export function downloadSession(session: ExportSession): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
