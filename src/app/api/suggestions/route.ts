import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MODELS } from "@/lib/defaults";
import type { Suggestion, SuggestionType } from "@/lib/types";

const VALID_TYPES: SuggestionType[] = [
  "question_to_ask",
  "talking_point",
  "answer",
  "fact_check",
  "clarification",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      latestChunk,
      priorContext,
      prompt,
      apiKey,
      // legacy single-string field, still supported
      transcript,
    } = body as {
      latestChunk?: string;
      priorContext?: string;
      prompt: string;
      apiKey: string;
      transcript?: string;
    };

    const effectiveLatest = (latestChunk ?? transcript ?? "").trim();
    const effectivePrior = (priorContext ?? "").trim();

    if (!effectiveLatest) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }
    if (!apiKey) return NextResponse.json({ error: "No API key provided" }, { status: 400 });

    const groq = new Groq({ apiKey });

    // The prompt template now expects {latest_chunk} and {prior_context}.
    // For backward compatibility with the old {transcript} placeholder, fall
    // back to it if the new placeholders aren't present.
    const filledPrompt = prompt.includes("{latest_chunk}")
      ? prompt
          .replace("{latest_chunk}", effectiveLatest)
          .replace("{prior_context}", effectivePrior || "(no earlier context)")
      : prompt.replace("{transcript}", `${effectivePrior}\n\n${effectiveLatest}`.trim());

    // gpt-oss-120b in json_object mode requires the root to be an object.
    const wrappedPrompt = `${filledPrompt}

IMPORTANT: Return a single JSON object with one key "suggestions" whose value is an array of exactly 3 suggestions. Each suggestion must have a "type" (one of: question_to_ask, talking_point, answer, fact_check, clarification) and a "text" string. The 3 suggestions must each have a different "type".`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completion: any = await groq.chat.completions.create({
      model: MODELS.suggestions,
      messages: [{ role: "user", content: wrappedPrompt }],
      temperature: 0.7,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ reasoning_effort: "low", include_reasoning: false } as any),
    });

    const choice = completion.choices[0];
    const raw: string = choice?.message?.content || "";

    if (!raw) {
      return NextResponse.json(
        { error: `Model returned empty response (finish_reason: ${choice?.finish_reason})` },
        { status: 500 }
      );
    }

    let parsedRoot: unknown;
    try {
      parsedRoot = JSON.parse(raw);
    } catch {
      // Fallback: the model occasionally emits a bare array despite json_object mode.
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (!arrMatch) {
        return NextResponse.json({ error: "Model returned invalid JSON", raw: raw.slice(0, 200) }, { status: 500 });
      }
      try {
        parsedRoot = { suggestions: JSON.parse(arrMatch[0]) };
      } catch {
        return NextResponse.json({ error: "Model returned invalid JSON", raw: raw.slice(0, 200) }, { status: 500 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = parsedRoot as any;
    const arr: unknown[] = Array.isArray(root)
      ? root
      : Array.isArray(root?.suggestions)
      ? root.suggestions
      : Array.isArray(root?.items)
      ? root.items
      : [];

    const seenTypes = new Set<SuggestionType>();
    const seenTexts = new Set<string>();
    const suggestions: Suggestion[] = [];

    for (const item of arr) {
      if (suggestions.length >= 3) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = item as any;
      const text =
        [s.text, s.preview, s.suggestion, s.content, s.description, s.title]
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .sort((a, b) => b.length - a.length)[0] ?? "";

      const rawType = (s.type ?? "talking_point") as SuggestionType;
      const type: SuggestionType = VALID_TYPES.includes(rawType) ? rawType : "talking_point";

      if (!text) continue;
      const dedupKey = text.trim().toLowerCase().slice(0, 80);
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
      seenTypes.add(type);

      suggestions.push({
        id: `${Date.now()}-${suggestions.length}`,
        type,
        text: text.trim(),
      });
    }

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "Model returned suggestions with no text", raw: raw.slice(0, 200) },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    console.error("[suggestions]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
