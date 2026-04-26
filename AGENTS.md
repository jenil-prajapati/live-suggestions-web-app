# Notes for building the Live Suggestions assistant

okay so here's what this thing is supposed to do and how i want it built. read this before touching anything.

## the idea

it's an AI meeting copilot. you leave the mic running during a meeting and it listens, transcribes what's being said, and every 30 seconds surfaces 3 useful suggestions — stuff like a smart question to ask, a fact to bring up, or an answer to something that was just asked. clicking one of those cards opens a detailed answer on the right. you can also just type questions directly.

that's it. keep it simple.

## what the LLM needs to do

there are 3 places where the model gets called:

**1. live suggestions (every 30s)**

take the **latest transcript chunk** plus a bounded slice of prior context (default ~4000 chars total) and generate exactly 3 suggestions. each one is a single short sentence, max ~18 words. not a paragraph. one punchy diagnostic line that's already useful without clicking.

the prompt explicitly separates `### EARLIER CONTEXT ###` and `### LATEST TURN ###`. the model is told to anchor every suggestion to the latest turn — earlier context is reference only. this is what kills the "topic contamination" issue where old themes leak into the new batch.

types: `question_to_ask`, `talking_point`, `answer`, `fact_check`, `clarification`. **the 3 must each have a different type**. if someone just asked a question, answer it. if a shaky claim was made, fact-check it. don't restate the problem — probe it.

return a JSON object `{ "suggestions": [...] }`. we're in json_object mode so the root has to be an object.

**2. detailed answer (when user clicks a card)**

uses more context — up to 12000 chars of transcript. you know which suggestion they clicked. give a real, grounded response. 1 direct sentence + 2–4 tight bullets. **do not always end with a follow-up question** — only end with one if it genuinely sharpens the next turn. don't invent stats. don't slip into consultant mode ("we'll implement…"). use "you" / "your".

**3. direct chat**

same shape as #2. user typed something directly. use the transcript as context, stream it back token by token. concise, grounded, no roadmaps.

## the pipeline (this is the important part)

it's not a wall-clock timer. it's driven by transcript commits:

```
audio chunk → /api/transcribe → commit chunk to state → /api/suggestions → commit batch
```

`useLiveSession` owns this whole pipeline. one `pipelineLockRef` ref serialises it so two cycles can't interleave. one `suggestionsInFlightRef` prevents the manual refresh and the auto-refresh from racing each other.

the previous version had a setInterval that fired every 30s regardless — that's what caused suggestion batches to appear before their transcript chunks were rendered. don't reintroduce that pattern.

## stuff that trips people up

- mic records as `audio/webm;codecs=opus`. whisper rejects that codec suffix — strip to `audio/webm` before sending.
- blobs under ~10KB are basically silence/header frames. whisper returns `could not process file` 400s on those. skip them client-side AND swallow them server-side.
- gpt-oss-120b is a **reasoning model**. Groq docs: put instructions in the user message (not a system prompt) for chat, use `response_format: { type: "json_object" }` for structured suggestions, set `reasoning_effort: "low"` for fast live suggestions / `"medium"` for chat. set `include_reasoning: false` so `content` is clean.
- the model occasionally emits the suggestion body under `preview` or `title` instead of `text`. parser picks the longest non-empty field so both work.
- when a suggestion is clicked, the user message sent to /api/chat is just `(expand this suggestion)` — the actual suggestion text is fed via the `detailedAnswerPrompt` template's placeholders. otherwise the model gets the same string twice and starts repeating itself.
- manual reload flushes audio first, then re-enters the pipeline. it never just regenerates suggestions over stale transcript.
- no database, no auth, no `.env` keys. the user pastes their own Groq key in Settings. it lives in localStorage. never log it, never send it anywhere except Groq.

## the stack

- next.js 16 app router (frontend + api routes in one repo)
- tailwind v4, typescript
- groq SDK — whisper-large-v3 for transcription, openai/gpt-oss-120b for everything else
- jest for tests (49 of them; node 18 test env needs the `File` polyfill in `jest.setup.ts`)

## files worth knowing

- `src/hooks/useLiveSession.ts` — ⭐ the pipeline. this is the heart of the app
- `src/lib/prompts.ts` — the actual prompt text. this is where quality comes from, edit here first
- `src/lib/api.ts` — thin client wrappers around the api routes
- `src/lib/export.ts` — export builder; preserves batch↔chunk and chat↔batch links
- `src/lib/defaults.ts` — model names and default context windows
- `src/hooks/useAudioRecorder.ts` — mic + chunking logic
- `src/hooks/useSettings.ts` — localStorage settings with version-based migration. **bump `SETTINGS_VERSION` whenever you change prompt defaults** so users on stale prompts get the new ones.
- `src/app/page.tsx` — thin shell. composition only, no state logic
- `__tests__/` — jest tests for the api routes, prompts, and export

## what i care about most

honestly the prompts are 80% of this. if the suggestions are vague or generic the whole thing falls flat. they need to be specific to what was actually said, diagnostic rather than descriptive, and short enough to read in 2 seconds. that's the whole product.

second-most-important thing: trust. never let the model invent stats, percentages, timelines, or tool names. the prompts ban it explicitly. if you change a prompt, keep that ban.

third: ordering. transcript chunks and suggestion batches must stay synchronised. no batch should ever appear without its transcript chunk visible. that's why the pipeline is serialised.
