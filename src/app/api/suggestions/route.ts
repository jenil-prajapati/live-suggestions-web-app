import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MODELS } from "@/lib/defaults";
import type { Suggestion } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, prompt, apiKey } = body as {
      transcript: string;
      prompt: string;
      apiKey: string;
    };

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }
    if (!apiKey) return NextResponse.json({ error: "No API key provided" }, { status: 400 });

    const groq = new Groq({ apiKey });

    // Wrap the prompt so json_object mode has a root object to return
    const filledPrompt = prompt.replace("{transcript}", transcript);
    const wrappedPrompt = `${filledPrompt}

IMPORTANT: Return a JSON object with a single key "suggestions" whose value is the array of 3 suggestions.
Example: { "suggestions": [ { "type": "question_to_ask", "text": "..." }, ... ] }`;

    // gpt-oss-120b is a reasoning model — per Groq docs, put all instructions
    // in the user message (avoid system prompt) and use response_format json_object
    // with reasoning_effort low for fast live suggestions.
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

    console.log(
      "[suggestions] finish_reason:", choice?.finish_reason,
      "| content length:", raw.length,
      "| preview:", raw.slice(0, 250)
    );

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
      // fallback: try to extract an array if the model didn't wrap in object
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

    const suggestions: Suggestion[] = arr
      .slice(0, 3)
      .map((item, i) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = item as any;
        // Pick the longest non-empty text field (text is preferred but model may use others)
        const text =
          [s.text, s.preview, s.suggestion, s.content, s.description, s.title]
            .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
            .sort((a, b) => b.length - a.length)[0] ?? "";
        return {
          id: `${Date.now()}-${i}`,
          type: s.type ?? "talking_point",
          text,
        };
      })
      .filter((s) => s.text);

    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Model returned suggestions with no text", raw: raw.slice(0, 200) }, { status: 500 });
    }

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    console.error("[suggestions] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
