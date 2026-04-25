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

    // Skip blobs that are too small to contain real speech.
    // 10 KB threshold — covers cases where the mic captured only silence/header frames
    // and would cause Whisper to return "could not process file" 400.
    if (audio.size < 10_000) {
      return NextResponse.json({ text: "" });
    }

    // Normalize MIME type — strip codec spec that Whisper doesn't accept
    // e.g. "audio/webm;codecs=opus" → "audio/webm"
    const baseMime = audio.type.split(";")[0] || "audio/webm";
    const ext = baseMime.includes("ogg") ? "ogg" : "webm";
    const normalizedFile = new File([audio], `audio.${ext}`, { type: baseMime });

    const groq = new Groq({ apiKey });

    try {
      const transcription = await groq.audio.transcriptions.create({
        file: normalizedFile,
        model: MODELS.transcription,
        response_format: "json",
      });
      return NextResponse.json({ text: transcription.text });
    } catch (whisperErr: unknown) {
      // Gracefully swallow Whisper "could not process file" errors — they happen
      // when the user stops recording mid-chunk or on very short/silent audio.
      const msg = whisperErr instanceof Error ? whisperErr.message : "";
      if (msg.includes("could not process file") || msg.includes("invalid media")) {
        console.warn("[transcribe] skipping unprocessable audio chunk:", audio.size, "bytes");
        return NextResponse.json({ text: "" });
      }
      throw whisperErr;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[transcribe] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
