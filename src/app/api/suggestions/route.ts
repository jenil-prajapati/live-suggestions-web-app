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

    const filledPrompt = prompt.replace("{transcript}", transcript);

    const completion = await groq.chat.completions.create({
      model: MODELS.suggestions,
      messages: [{ role: "user", content: filledPrompt }],
      temperature: 0.7,
      max_tokens: 512, // enough headroom for 3 suggestions without cutting mid-JSON
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    console.log("[suggestions] raw model output:", raw.slice(0, 500));

    // Extract JSON array even if model wraps it in markdown
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any[] = JSON.parse(jsonMatch[0]);

    const suggestions: Suggestion[] = parsed.slice(0, 3).map((s, i) => ({
      id: `${Date.now()}-${i}`,
      type: s.type ?? "talking_point",
      // Accept whatever field name the model chose
      text: s.text ?? s.title ?? s.suggestion ?? s.content ?? s.description ?? s.preview ?? "",
    })).filter((s) => s.text);

    if (suggestions.length === 0) {
      return NextResponse.json({ error: "Model returned suggestions with no text", raw }, { status: 500 });
    }

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
