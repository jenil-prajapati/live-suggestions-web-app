export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  /** The full suggestion text — 1-2 sentences, immediately useful on its own */
  text: string;
}

export interface SuggestionBatch {
  id: string;
  timestamp: number;
  suggestions: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** If this message was triggered by clicking a suggestion */
  suggestionRef?: string;
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
  /** Number of recent transcript chars to pass for suggestions */
  suggestionContextChars: number;
  /** Number of recent transcript chars to pass for detailed answers */
  detailedAnswerContextChars: number;
  /** Auto-refresh interval in ms */
  refreshIntervalMs: number;
}

export interface ExportSession {
  exportedAt: string;
  transcript: { timestamp: string; text: string }[];
  suggestionBatches: {
    timestamp: string;
    suggestions: { type: string; text: string }[];
  }[];
  chat: { timestamp: string; role: string; content: string }[];
}
