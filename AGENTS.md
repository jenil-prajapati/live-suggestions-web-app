# Notes for building the Live Suggestions assistant

okay so here's what this thing is supposed to do and how i want it built. read this before touching anything.

## the idea

it's an AI meeting copilot. you leave the mic running during a meeting and it listens, transcribes what's being said, and every 30 seconds surfaces 3 useful suggestions — stuff like a smart question to ask, a fact to bring up, or an answer to something that was just asked. clicking one of those cards opens a detailed answer on the right. you can also just type questions directly.

that's it. keep it simple.

## what the LLM needs to do

there are 3 places where the model gets called:

**1. live suggestions (every 30s)**
take the last ~4000 chars of the transcript and generate exactly 3 suggestions. each one should be a single short sentence — max ~18 words. not a paragraph, not two sentences. one punchy diagnostic line that's already useful without clicking.

the types are: question to ask, talking point, answer, fact check, clarification. pick whichever mix makes sense for what's actually happening right now. if someone just asked a question, answer it. if a shaky claim was made, fact check it. don't always give 3 of the same type. and don't just restate the problem — probe it.

return a JSON object `{ "suggestions": [...] }`. we're in json_object mode so the root has to be an object.

**2. detailed answer (when user clicks a card)**
uses more context — up to 12000 chars of transcript. you know which suggestion they clicked. give a real, grounded response. 1 direct sentence + 3–4 bullets + 1 follow-up question. don't write paragraphs. don't invent stats.

**3. direct chat**
same shape as #2. user typed something directly. use the transcript as context, stream it back token by token.

## stuff that trips people up

- the mic records in `audio/webm;codecs=opus`. whisper rejects that codec suffix — strip to `audio/webm` before sending.
- if a blob is under ~10KB it's basically silence/header frames. whisper returns `could not process file` 400s on those. skip them client-side AND swallow them server-side.
- gpt-oss-120b is a **reasoning model**. the Groq docs say: put instructions in the user message (not a system prompt), use `response_format: { type: "json_object" }` for structured output, and set `reasoning_effort: "low"` for fast live suggestions / `"medium"` for chat. set `include_reasoning: false` so the `content` field is clean JSON.
- the model occasionally emits the suggestion body under `preview` or `title` instead of `text`. the parser picks the longest non-empty field so both work.
- the manual reload button needs to flush whatever audio is buffered, transcribe it, THEN generate suggestions. not just suggestions alone.
- no database, no auth, no `.env` keys. the user pastes their own Groq key in Settings. it lives in localStorage. never log it, never send it anywhere except Groq.

## the stack

- next.js 16 app router (frontend + api routes in one repo)
- tailwind v4, typescript
- groq SDK — whisper-large-v3 for transcription, openai/gpt-oss-120b for everything else
- jest for tests

## files worth knowing

- `src/app/page.tsx` — all the session state, timers, and orchestration
- `src/lib/prompts.ts` — the actual prompt text. this is where quality comes from, edit here first
- `src/lib/defaults.ts` — model names and default context window sizes
- `src/hooks/useAudioRecorder.ts` — mic + chunking logic
- `src/hooks/useSettings.ts` — localStorage settings with version-based migration
- `__tests__/` — jest tests for all 3 api routes + the prompt templates

## what i care about most

honestly the prompts are 80% of this. if the suggestions are vague or generic the whole thing falls flat. they need to be specific to what was actually said, diagnostic rather than descriptive, and short enough to read in 2 seconds. that's the whole product.
