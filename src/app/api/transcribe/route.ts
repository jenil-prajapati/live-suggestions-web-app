import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MODELS } from "@/lib/defaults";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const apiKey = formData.get("apiKey") as string | null;

    if (!audio) return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "No API key provided" }, { status: 400 });

    const groq = new Groq({ apiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: MODELS.transcription,
      response_format: "json",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
