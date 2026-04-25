# Notes for building the Live Suggestions assistant

okay so here's what this thing is supposed to do and how i want it built. read this before touching anything.

---

## the idea

it's an AI meeting copilot. you leave the mic running during a meeting and it listens, transcribes what's being said, and every 30 seconds surfaces 3 useful suggestions — stuff like a smart question to ask, a fact to bring up, or an answer to something that was just asked. clicking one of those cards opens a detailed answer on the right. you can also just type questions directly.

that's it. keep it simple.

---

## what the LLM needs to do

there are 3 places where the model gets called:

**1. live suggestions (every 30s)**
take the last ~4000 chars of the transcript and generate exactly 3 suggestions. each one should be a single short sentence — max 15 words. not a paragraph, not two sentences. one punchy line that's already useful without clicking.

the types are: question to ask, talking point, answer, fact check, clarification. pick whichever mix makes sense for what's actually happening in the conversation right now. if someone just asked a question, answer it. if a shaky claim was made, fact check it. don't always give 3 of the same type.

return plain JSON. no markdown wrapping. no explanation outside the array.

**2. detailed answer (when user clicks a card)**
now use more context — up to 12000 chars of transcript. you know which suggestion they clicked (the type and the text). give a real, detailed response — 3-5 paragraphs, concrete, opinionated. don't just repeat what the card said. go deeper.

**3. direct chat**
same depth as #2. user typed something directly. use the transcript as context, answer it thoroughly, stream it back token by token.

---

## stuff that trips people up

- the mic records in chunks. MediaRecorder gives us `audio/webm;codecs=opus` as the MIME type. whisper doesn't like that — strip the codec part before sending. just use `audio/webm`.
- if the audio blob is under 2KB it's basically silence. skip it, don't send to whisper.
- when the model returns suggestions, it sometimes uses `title` instead of `text` as the field name. handle both.
- the manual reload button should flush whatever audio is buffered first, then generate suggestions. not just suggestions alone.
- no database, no auth, no .env keys. the user pastes their own groq key in settings. it lives in localStorage. never log it.

---

## the stack

- next.js 16 app router (frontend + api routes in one repo)
- tailwind css, typescript
- groq SDK — whisper-large-v3 for transcription, openai/gpt-oss-120b for everything else
- jest for tests

---

## files worth knowing

- `src/app/page.tsx` — all the session state and timers live here
- `src/lib/prompts.ts` — the actual prompt text. this is where quality comes from, edit here first
- `src/lib/defaults.ts` — model names and default context window sizes
- `src/hooks/useAudioRecorder.ts` — mic + chunking logic
- `__tests__/` — jest tests for all 3 api routes + the prompt templates

---

## what i care about most

honestly the prompts are 80% of this. if the suggestions are vague or generic the whole thing falls flat. they need to be specific to what was actually said, immediately useful, and short enough to read in 2 seconds. that's the whole product.
