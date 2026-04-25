# TwinMind — Live Suggestions

A live meeting copilot. Listens to your mic, transcribes in real time, and every 30 seconds surfaces 3 diagnostic suggestions — questions to ask, talking points, answers, fact-checks, or clarifications. Click any card for a grounded detailed answer, or chat directly.

**Live demo:** _[deploy URL]_

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Transcription | Groq `whisper-large-v3` |
| Suggestions + Chat | Groq `openai/gpt-oss-120b` |
| Audio | Browser `MediaRecorder` |
| Tests | Jest + ts-jest |

Everything frontend and backend lives in one Next.js repo. Streaming chat responses use SSE over a `ReadableStream`.

---

## Setup

Node.js **20+** is required.

```bash
nvm use 20
npm install
npm run dev
```

Open `http://localhost:3000`, click **Settings**, and paste your [Groq API key](https://console.groq.com/keys). The key is stored in `localStorage` only — no `.env` file, nothing persisted server-side.

```bash
npm test         # run unit + integration tests
npm run build    # production build
```

---

## How it works

Three panels, one continuous session:

1. **Transcript.** `MediaRecorder` records 1-second audio slices. Every 30 s they're flushed as a single `webm` blob to `/api/transcribe`, which strips the codec suffix from the MIME type, guards against sub-10 KB silent blobs, and hands it to Whisper.
2. **Live suggestions.** Every 30 s the last ~4,000 chars of transcript are sent to `/api/suggestions`, which calls `gpt-oss-120b` in `json_object` mode with `reasoning_effort: "low"`. The response is parsed defensively (the model occasionally emits `title` or `preview` instead of `text` — the parser picks the longest non-empty field). The manual **Reload** button flushes audio first, then regenerates.
3. **Chat.** Clicking a suggestion auto-sends it with the `detailedAnswerPrompt`. Typing directly uses the `chatPrompt`. Both stream token-by-token from `/api/chat`. Last 10 messages are kept for conversational coherence.

A thin version-bumped migration in `useSettings` ensures new prompt defaults replace stale ones in `localStorage` when the app updates, without losing the user's API key.

---

## Prompt strategy

Prompt quality is the entire product. All three prompts live in `src/lib/prompts.ts` and are user-editable in Settings.

**Live suggestions.** Forces diagnostic, probing output — not restatements. Every prompt includes explicit *WEAK vs. STRONG* examples so the model has a concrete contrast to learn from (few-shot over pure instructions works dramatically better). Each suggestion is one sentence, ≤18 words, and must be anchored to a specific line in the transcript. At least one must be a `question_to_ask`.

**Detailed answer.** 1 direct sentence + 3–4 tight bullets + 1 follow-up question. Explicitly forbids inventing stats or slipping into consultant-mode ("we'll implement X"). The model speaks in second person because the user is in a meeting, not staffing a project.

**Chat.** Same shape as detailed answer. Streamed. Rolling 10-message history for continuity.

---

## Context windows

| Use | Default | Why |
|---|---|---|
| Live suggestions | 4,000 chars (~1,000 tok) | Enough for ~2 min of speech; avoids noise from stale context |
| Detailed answer / chat | 12,000 chars (~3,000 tok) | Full meeting arc for richer answers |
| Chat history | Last 10 messages | Keeps coherence without ballooning tokens |

All three are user-configurable under **Settings → Context & Timing**.

---

## Tradeoffs

- **30 s audio chunking.** Shorter intervals reduce transcript latency but multiply API calls. Configurable.
- **Suggestions on timer, not on every new chunk.** Otherwise small transcript deltas cause redundant regenerations.
- **No streaming for suggestions.** JSON-object mode returns a single object; mid-generation parsing isn't worth the complexity for a ~1–2 s response.
- **`localStorage` for settings + API key.** Simple, no backend needed. The key never leaves the browser except in calls to Groq.
- **No login or persistence.** Per spec. Export the session to JSON before closing.
- **Merged system prompt into user turn.** `gpt-oss-120b` behaves better this way per Groq's own guidance.

---

## Export format

The **Export** button downloads:

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
        { "type": "question_to_ask", "text": "..." }
      ]
    }
  ],
  "chat": [
    { "timestamp": "...", "role": "user", "content": "..." },
    { "timestamp": "...", "role": "assistant", "content": "..." }
  ]
}
```

---

## Project layout

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           SSE chat endpoint
│   │   ├── suggestions/route.ts    JSON suggestions endpoint
│   │   └── transcribe/route.ts     Whisper wrapper with size + MIME guards
│   ├── layout.tsx
│   └── page.tsx                    Session state + three-panel orchestration
├── components/                     TranscriptPanel, SuggestionsPanel, ChatPanel, SuggestionCard, SettingsModal
├── hooks/
│   ├── useAudioRecorder.ts         MediaRecorder + 30 s flush loop
│   └── useSettings.ts              localStorage + versioned migration
└── lib/
    ├── defaults.ts                 MODELS + DEFAULT_SETTINGS
    ├── prompts.ts                  The three prompt templates
    └── types.ts                    Shared types

__tests__/                          Jest tests: prompts, chat, suggestions, transcribe
```
