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

    // Skip blobs that are too small to contain real speech (< 2 KB = silence/header only)
    if (audio.size < 2000) return NextResponse.json({ text: "" });

    // Normalize MIME type — strip codec spec that Whisper doesn't accept
    // e.g. "audio/webm;codecs=opus" → "audio/webm"
    const baseMime = audio.type.split(";")[0] || "audio/webm";
    const ext = baseMime.includes("ogg") ? "ogg" : "webm";
    const normalizedFile = new File([audio], `audio.${ext}`, { type: baseMime });

    const groq = new Groq({ apiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: normalizedFile,
      model: MODELS.transcription,
      response_format: "json",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
