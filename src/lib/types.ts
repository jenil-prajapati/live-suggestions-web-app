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
  timestamp: number;
  suggestions: Suggestion[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Populated when the message originated from a suggestion click. */
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
  suggestionContextChars: number;
  detailedAnswerContextChars: number;
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
