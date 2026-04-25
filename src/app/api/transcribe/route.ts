import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MODELS } from "@/lib/defaults";

// Blobs below this size are almost always silence or codec headers and will
// cause Whisper to return "could not process file" 400s.
const MIN_BLOB_BYTES = 10_000;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const apiKey = formData.get("apiKey") as string | null;

    if (!audio) return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "No API key provided" }, { status: 400 });
    if (audio.size < MIN_BLOB_BYTES) return NextResponse.json({ text: "" });

    // Whisper rejects MIME types with codec suffixes (e.g. audio/webm;codecs=opus).
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
      // Short/silent/truncated chunks slip past the size guard occasionally;
      // treat them as empty rather than surfacing a 500 to the UI.
      const msg = whisperErr instanceof Error ? whisperErr.message : "";
      if (msg.includes("could not process file") || msg.includes("invalid media")) {
        console.warn("[transcribe] skipping unprocessable chunk:", audio.size, "bytes");
        return NextResponse.json({ text: "" });
      }
      throw whisperErr;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
