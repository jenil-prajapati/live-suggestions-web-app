# TwinMind — Live Suggestions

An always-on AI meeting copilot that listens to your mic, transcribes in real time, and continuously surfaces 3 context-aware suggestions. Click any suggestion for a detailed answer, or chat directly.

**Live demo:** _[Deploy URL here]_

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | SSR + API routes in one repo; streaming responses work out of the box |
| Language | TypeScript | Type safety across shared types (suggestions, chat, transcript) |
| Styling | Tailwind CSS v4 | Fast iteration on dark-theme utility classes |
| AI | Groq SDK | `whisper-large-v3` for transcription, `openai/gpt-oss-120b` for suggestions + chat |
| Audio | Web `MediaRecorder` API | Browser-native, no extra deps; flushes 30s chunks |

---

## Setup

1. **Requires Node.js ≥ 20.** If you use nvm: `nvm use 20`
2. Clone the repo and install:
   ```bash
   npm install
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`, click **Settings**, and paste your [Groq API key](https://console.groq.com/keys).

No `.env` file needed — the key is stored only in your browser's `localStorage`.

---

## Prompt Strategy

### Live Suggestions (every ~30s)
The suggestions prompt receives the **last 4,000 characters** of the transcript (configurable). It instructs the model to:

- Identify what just happened in the conversation: question asked? claim made? topic shift? silence?
- Choose suggestion **types dynamically** — not always 3 of the same type. Types: `question_to_ask`, `talking_point`, `answer`, `fact_check`, `clarification`.
- Write a **preview that delivers value on its own** — not a teaser. If the model answers a question in the preview, the user already wins before clicking.
- Never be generic. Every suggestion must reference something specific from the transcript.

This is the core judgment call: the model reads the most recent lines, decides what the user needs right now (an answer, a fact check, a follow-up question), and generates all three with substance.

### Detailed Answer (on suggestion click)
Uses the **full transcript** up to 12,000 characters. Passes the clicked suggestion's type and text as context, and asks the model to expand — not repeat — into 3–5 paragraphs with concrete numbers, examples, and actionable next steps. This creates a clear two-level UX: read the card for immediate value, click for depth.

### Chat (direct messages)
System prompt + rolling **last 10 messages** for conversational coherence. Same detailed-answer depth as suggestion clicks — 3–5 paragraphs with specific references to the transcript. Streamed token-by-token for low perceived latency.

---

## Context Window Choices

| Use case | Default | Rationale |
|---|---|---|
| Suggestions | 4,000 chars (~1,000 tokens) | Enough for ~2 min of speech; avoids noise from too-early context |
| Detailed answers / chat | 12,000 chars (~3,000 tokens) | Full meeting arc for richer answers |
| Chat history | Last 10 messages | Keeps chat coherent without ballooning tokens |

All values are user-editable in Settings → Context & Timing.

---

## Tradeoffs

- **Client-side audio chunking (30s):** The `MediaRecorder` collects 1-second slices and flushes a blob every 30s to `/api/transcribe`. This means transcript latency ≤ 30s. A shorter interval (e.g. 10s) would reduce latency but increase API calls. Configurable via Settings.
- **Suggestions on every refresh, not on every new chunk:** Transcription and suggestion refreshes are decoupled. Transcription happens whenever a chunk arrives; suggestions refresh on a separate 30s timer. This avoids regenerating suggestions for small transcript deltas.
- **No streaming for suggestions:** Suggestions are returned as a JSON object. Streaming a JSON array mid-generation would require complex partial parsing. Given ~500 tps on Groq, a 3-suggestion response is typically under 2 seconds.
- **localStorage for settings:** Simple, no backend needed for this prototype. The API key never leaves the browser except in direct calls to Groq.
- **No login/persistence:** Per spec. Session state is fully in-memory; export to JSON before closing.

---

## Export Format

Clicking **Export** downloads a JSON file:

```json
{
  "exportedAt": "2026-04-20T18:00:00.000Z",
  "transcript": [
    { "timestamp": "...", "text": "..." }
  ],
  "suggestionBatches": [
    {
      "timestamp": "...",
      "suggestions": [
        { "type": "question_to_ask", "text": "What's your current p99 latency on websocket round-trips?" }
      ]
    }
  ],
  "chat": [
    { "timestamp": "...", "role": "user", "content": "..." },
    { "timestamp": "...", "role": "assistant", "content": "..." }
  ]
}
```
