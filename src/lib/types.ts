export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  text: string;
}

export interface SuggestionBatch {
  id: string;
  /** Wall-clock time when the batch was committed to state. */
  timestamp: number;
  /** Index of the latest transcript chunk that was committed before this batch.
   *  Lets the UI/export prove a batch never appeared without its chunk. */
  basedOnChunkId: string | null;
  suggestions: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Populated when the message originated from a suggestion click. */
  suggestionRef?: string;
  /** Batch id the clicked suggestion came from (for export integrity). */
  suggestionBatchId?: string;
  /** Suggestion id the user clicked (for export integrity). */
  suggestionId?: string;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
}

export interface SessionSettings {
  groqApiKey: string;
  suggestionPrompt: string;
  detailedAnswerPrompt: string;
  chatPrompt: string;
  /** How much earlier transcript to send alongside the latest chunk for live suggestions. */
  suggestionContextChars: number;
  /** Larger window for detailed answers and direct chat. */
  detailedAnswerContextChars: number;
  refreshIntervalMs: number;
}

export interface ExportSession {
  appVersion: string;
  exportedAt: string;
  sessionStartedAt: string | null;
  transcript: { id: string; timestamp: string; text: string }[];
  suggestionBatches: {
    id: string;
    timestamp: string;
    basedOnChunkId: string | null;
    suggestions: { id: string; type: string; text: string; clicked: boolean }[];
  }[];
  chat: {
    id: string;
    timestamp: string;
    role: string;
    content: string;
    suggestionBatchId?: string;
    suggestionId?: string;
  }[];
}
