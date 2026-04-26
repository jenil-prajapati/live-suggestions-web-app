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

Frontend, API routes, and audio pipeline all live in one Next.js repo. Streaming chat responses use SSE over a `ReadableStream`.

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
npm test         # 49 unit + integration tests
npm run build    # production build
```

---

## Architecture

```
              ┌─────────────────┐
   Mic ──────▶│  MediaRecorder  │  (1s slices, flushed every 30s)
              └────────┬────────┘
                       │  Blob (≥10KB)
                       ▼
              ┌─────────────────────────────────────────┐
              │  useLiveSession (single source of truth)│
              │  ─────────────────────────────────────  │
              │  pipelineLockRef — no two cycles overlap│
              │                                         │
              │   Blob ─▶ /api/transcribe ─▶ Whisper    │
              │            │                            │
              │            ▼                            │
              │   commit chunk (await state)            │
              │            │                            │
              │            ▼                            │
              │   buildSuggestionContext():             │
              │      latestChunk + bounded prior        │
              │            │                            │
              │            ▼                            │
              │   /api/suggestions ─▶ gpt-oss-120b      │
              │            │                            │
              │            ▼                            │
              │   commit batch (basedOnChunkId set)     │
              └─────────────────────────────────────────┘
```

The pipeline is serialised by `pipelineLockRef` — a chunk is always committed *before* the suggestion request that uses it goes out, and a new cycle can't start while another is mid-flight. Every batch records `basedOnChunkId`, so the export proves which chunk produced which batch.

---

## How it works

Three panels, one continuous session:

1. **Transcript.** `MediaRecorder` records 1-second audio slices. Every 30 s they're flushed as a single `webm` blob to `/api/transcribe`. The endpoint strips the codec suffix from the MIME type, drops sub-10 KB silent blobs, and gracefully returns empty text when Whisper rejects a chunk as unprocessable (instead of surfacing a 500).
2. **Live suggestions.** After each transcript commit, the **latest chunk** plus a bounded slice of prior context is sent to `/api/suggestions`. The route calls `gpt-oss-120b` in `json_object` mode with `reasoning_effort: "low"`, parses defensively, dedupes near-identical cards, and normalises any unknown `type` to `talking_point`. Manual **Reload** flushes audio first, runs the same pipeline, and emits a fresh batch — never out of order.
3. **Chat.** Clicking a suggestion auto-sends it through the `detailedAnswerPrompt`. Typing directly uses the `chatPrompt`. Both stream token-by-token from `/api/chat`. Last 10 messages are kept for conversational coherence.

A versioned migration in `useSettings` swaps stale prompt defaults for new ones when the app updates, without losing the user's API key.

---

## Prompt strategy

Prompt quality *is* the product. All three prompts live in `src/lib/prompts.ts` and are user-editable in Settings.

**Live suggestions.** The prompt explicitly separates `### EARLIER CONTEXT ###` from `### LATEST TURN ###`, telling the model to anchor every suggestion to the latest turn. It enforces role diversity (the 3 cards must each have a different `type`), forbids invented numbers / fake specificity, and includes a *WEAK vs. STRONG* example block so the model has a concrete contrast to learn from. Each suggestion is one sentence, ≤18 words, decision-oriented.

**Detailed answer.** Expansion of a clicked suggestion. 1 direct sentence + 2–4 tight bullets. Explicitly forbids inventing stats or slipping into consultant-mode ("we'll implement X"). Does **not** force a follow-up question — only ends with one when it genuinely sharpens the next turn. Tone is copilot, not strategy memo.

**Chat.** Same shape, optimised for typed questions. Concise, grounded, no roadmaps, no padding.

---

## Context windows

| Use | Default | Why |
|---|---|---|
| Live suggestions — latest chunk | full | The model anchors here |
| Live suggestions — prior context | up to 4,000 chars total | Bounded, only used if it supports the latest thread |
| Detailed answer / chat | last 12,000 chars | Full meeting arc for richer answers |
| Chat history | last 10 messages | Coherence without token bloat |

All values are user-configurable under **Settings → Context & Timing**.

---

## Tradeoffs

- **30 s audio chunking.** Shorter intervals reduce transcript latency but multiply API calls. Configurable.
- **Suggestion timer is driven by transcript commits, not the wall clock.** This is the fix for the "batch appears before its chunk" race.
- **No streaming for suggestions.** JSON-object mode returns a single object; mid-generation parsing isn't worth the complexity for a ~1–2 s response.
- **`localStorage` for settings + API key.** Simple, no backend needed. The key never leaves the browser except in calls to Groq.
- **No login or persistence.** Per spec. Export the session to JSON before closing.
- **Merged system prompt into user turn for chat.** `gpt-oss-120b` behaves better this way per Groq's own guidance.

---

## Export format

The **Export** button downloads a JSON file shaped like this:

```jsonc
{
  "appVersion": "1.0.0",
  "exportedAt": "2026-04-26T22:00:00.000Z",
  "sessionStartedAt": "2026-04-26T21:45:00.000Z",
  "transcript": [
    { "id": "c-1714169100000", "timestamp": "...", "text": "..." }
  ],
  "suggestionBatches": [
    {
      "id": "b-1714169130000",
      "timestamp": "...",
      "basedOnChunkId": "c-1714169100000",   // links batch ↔ transcript chunk
      "suggestions": [
        {
          "id": "1714169130000-0",
          "type": "question_to_ask",
          "text": "...",
          "clicked": true                     // marks which cards the user clicked
        }
      ]
    }
  ],
  "chat": [
    {
      "id": "u-1714169145000",
      "timestamp": "...",
      "role": "user",
      "content": "...",
      "suggestionBatchId": "b-1714169130000", // present when click-originated
      "suggestionId": "1714169130000-0"
    },
    { "id": "a-...", "timestamp": "...", "role": "assistant", "content": "..." }
  ]
}
```

The schema is integrity-preserving: every clicked suggestion is traceable back to its batch, every batch back to the transcript chunk it was built on.

---

## Why the design fits the assignment

| Requirement | Implementation |
|---|---|
| Mic start/stop | `useAudioRecorder` + `useLiveSession.start/stop` |
| Transcript appends every ~30 s | `MediaRecorder.start(1000)` + 30 s flush |
| Auto-scroll | `TranscriptPanel` keeps the latest line in view |
| Auto-refresh transcript + suggestions every ~30 s | Pipeline runs on every audio flush, in order |
| Manual refresh updates transcript first | `manualRefresh` calls `recorder.flush()` which re-enters the same pipeline |
| Exactly 3 fresh suggestions per refresh | API caps at 3, dedupes near-identical text |
| New batch on top, older batches stay | `SuggestionsPanel` renders newest-first, faded older |
| Preview useful before click | Prompt forces decision-oriented, ≤18-word cards |
| Suggestion type variety | Prompt mandates role diversity per batch |
| Click expands to a longer answer | `clickSuggestion` routes via `detailedAnswerPrompt`, larger context window |
| Direct chat | Same hook, no `suggestion` argument, uses `chatPrompt` |
| Continuous chat per session | Single `chatMessages` array, last 10 turns sent as history |
| Export with timestamps | `buildExportSession` includes ids, timestamps, batch↔chunk links, click marks |
| Groq for everything | Whisper-large-v3 + gpt-oss-120b, no other providers |
| User-provided key | Settings modal + `localStorage`, never hard-coded |
| Editable prompts + tuning | Settings modal exposes all three prompts and 3 numeric knobs |

---

## Project layout

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts            SSE streaming chat
│   │   ├── suggestions/route.ts     JSON suggestions w/ dedup
│   │   └── transcribe/route.ts      Whisper wrapper w/ guards
│   ├── layout.tsx
│   └── page.tsx                     Thin shell — composes hook + panels
├── components/                      Panels, cards, modal
├── hooks/
│   ├── useAudioRecorder.ts          MediaRecorder + 30 s flush
│   ├── useLiveSession.ts            ⭐ pipeline orchestrator
│   └── useSettings.ts               localStorage + versioned migration
└── lib/
    ├── api.ts                       transcribeAudio / fetchSuggestions / streamChat
    ├── defaults.ts                  MODELS + DEFAULT_SETTINGS
    ├── export.ts                    buildExportSession + downloadSession
    ├── prompts.ts                   The three prompt templates
    └── types.ts                     Shared types

__tests__/                           Jest: prompts, chat, suggestions, transcribe, export
jest.setup.ts                        File polyfill for Node 18 test env
```
