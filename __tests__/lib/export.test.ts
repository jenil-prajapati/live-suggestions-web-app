import { buildExportSession, APP_VERSION } from "@/lib/export";
import type { ChatMessage, SuggestionBatch, TranscriptChunk } from "@/lib/types";

const chunks: TranscriptChunk[] = [
  { id: "c-1", text: "First chunk.", timestamp: 1_000 },
  { id: "c-2", text: "Second chunk.", timestamp: 2_000 },
];

const batches: SuggestionBatch[] = [
  {
    id: "b-1",
    timestamp: 1_500,
    basedOnChunkId: "c-1",
    suggestions: [
      { id: "s-1a", type: "question_to_ask", text: "Q1?" },
      { id: "s-1b", type: "talking_point", text: "T1" },
      { id: "s-1c", type: "fact_check", text: "F1" },
    ],
  },
  {
    id: "b-2",
    timestamp: 2_500,
    basedOnChunkId: "c-2",
    suggestions: [
      { id: "s-2a", type: "question_to_ask", text: "Q2?" },
      { id: "s-2b", type: "clarification", text: "C2" },
      { id: "s-2c", type: "answer", text: "A2" },
    ],
  },
];

const chat: ChatMessage[] = [
  {
    id: "u-1",
    role: "user",
    content: "Q1?",
    timestamp: 1_600,
    suggestionRef: "Question to ask",
    suggestionBatchId: "b-1",
    suggestionId: "s-1a",
  },
  { id: "a-1", role: "assistant", content: "Detailed answer.", timestamp: 1_700 },
  { id: "u-2", role: "user", content: "Direct typed question", timestamp: 3_000 },
  { id: "a-2", role: "assistant", content: "Direct answer.", timestamp: 3_100 },
];

describe("buildExportSession", () => {
  it("includes app version, exportedAt, and sessionStartedAt", () => {
    const out = buildExportSession({
      sessionStartedAt: 500,
      transcriptChunks: chunks,
      suggestionBatches: batches,
      chatMessages: chat,
    });
    expect(out.appVersion).toBe(APP_VERSION);
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.sessionStartedAt).toBe(new Date(500).toISOString());
  });

  it("preserves transcript chunk ids and timestamps", () => {
    const out = buildExportSession({
      sessionStartedAt: null,
      transcriptChunks: chunks,
      suggestionBatches: [],
      chatMessages: [],
    });
    expect(out.transcript).toHaveLength(2);
    expect(out.transcript[0]).toEqual({
      id: "c-1",
      text: "First chunk.",
      timestamp: new Date(1_000).toISOString(),
    });
  });

  it("links each batch to the chunk it was based on", () => {
    const out = buildExportSession({
      sessionStartedAt: null,
      transcriptChunks: chunks,
      suggestionBatches: batches,
      chatMessages: [],
    });
    expect(out.suggestionBatches[0].basedOnChunkId).toBe("c-1");
    expect(out.suggestionBatches[1].basedOnChunkId).toBe("c-2");
  });

  it("marks suggestions as clicked when a chat message references them", () => {
    const out = buildExportSession({
      sessionStartedAt: null,
      transcriptChunks: chunks,
      suggestionBatches: batches,
      chatMessages: chat,
    });
    const clicked = out.suggestionBatches[0].suggestions.find((s) => s.id === "s-1a");
    const notClicked = out.suggestionBatches[0].suggestions.find((s) => s.id === "s-1b");
    expect(clicked?.clicked).toBe(true);
    expect(notClicked?.clicked).toBe(false);
  });

  it("preserves the batch and suggestion ids on chat messages", () => {
    const out = buildExportSession({
      sessionStartedAt: null,
      transcriptChunks: chunks,
      suggestionBatches: batches,
      chatMessages: chat,
    });
    const clickMsg = out.chat.find((m) => m.id === "u-1");
    expect(clickMsg?.suggestionBatchId).toBe("b-1");
    expect(clickMsg?.suggestionId).toBe("s-1a");

    const directMsg = out.chat.find((m) => m.id === "u-2");
    expect(directMsg?.suggestionBatchId).toBeUndefined();
  });
});
