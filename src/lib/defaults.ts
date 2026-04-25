import type { SessionSettings } from "./types";
import {
  DEFAULT_SUGGESTION_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_CHAT_PROMPT,
} from "./prompts";

// detailedAnswerPrompt placeholders: {transcript}, {suggestion_type}, {suggestion_text}
export const DEFAULT_SETTINGS: Omit<SessionSettings, "groqApiKey"> = {
  suggestionPrompt: DEFAULT_SUGGESTION_PROMPT,
  detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
  chatPrompt: DEFAULT_CHAT_PROMPT,
  suggestionContextChars: 4000,
  detailedAnswerContextChars: 12000,
  refreshIntervalMs: 30000,
};

export const MODELS = {
  transcription: "whisper-large-v3",
  suggestions: "llama-3.3-70b-versatile",
  chat: "llama-3.3-70b-versatile",
} as const;
