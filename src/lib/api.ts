/**
 * Thin client wrappers around the Next.js API routes.
 *
 * Keeping these out of the page component lets us keep the orchestration code
 * focused on state and ordering, and makes it trivial to mock in tests.
 */
import type { ChatMessage, Suggestion } from "./types";

export interface TranscribeResult {
  text: string;
}

export async function transcribeAudio(blob: Blob, apiKey: string): Promise<TranscribeResult> {
  // Whisper rejects MIME types with codec suffixes (e.g. audio/webm;codecs=opus).
  const baseMime = blob.type.split(";")[0] || "audio/webm";
  const ext = baseMime.includes("ogg") ? "ogg" : "webm";
  const file = new File([blob], `audio.${ext}`, { type: baseMime });

  const fd = new FormData();
  fd.append("audio", file);
  fd.append("apiKey", apiKey);

  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { text: typeof data.text === "string" ? data.text : "" };
}

export interface SuggestionsRequest {
  latestChunk: string;
  priorContext: string;
  prompt: string;
  apiKey: string;
}

export async function fetchSuggestions(req: SuggestionsRequest): Promise<Suggestion[]> {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

export interface ChatStreamRequest {
  transcript: string;
  chatHistory: ChatMessage[];
  userMessage: string;
  prompt: string;
  apiKey: string;
  suggestionContext: { type: string; text: string } | null;
  detailedAnswerPrompt?: string;
}

/**
 * Streams a chat completion via SSE, calling onDelta for each chunk.
 * Resolves with the full concatenated text once [DONE] is received.
 */
export async function streamChat(
  req: ChatStreamRequest,
  onDelta: (delta: string) => void
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
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
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") return full;
      try {
        const { delta } = JSON.parse(payload);
        if (typeof delta === "string") {
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* skip malformed SSE frames */
      }
    }
  }
  return full;
}
