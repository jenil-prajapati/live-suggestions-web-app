/**
 * Integration tests for POST /api/transcribe
 *
 * Groq SDK is mocked so no real API calls are made.
 * Tests cover: happy path, MIME normalisation, min-size guard, missing fields.
 */

const mockTranscribeCreate = jest.fn().mockResolvedValue({ text: "Hello world" });

jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockTranscribeCreate } },
  }))
);

import { POST } from "@/app/api/transcribe/route";
import { NextRequest } from "next/server";

const FAKE_KEY = "gsk_test_key";

function makeRequest(audioFile: File | null, apiKey: string | null): NextRequest {
  const fd = new FormData();
  if (audioFile) fd.append("audio", audioFile);
  if (apiKey) fd.append("apiKey", apiKey);
  return new NextRequest("http://localhost/api/transcribe", {
    method: "POST",
    body: fd,
  });
}

function makeAudioFile(sizeBytes: number, mimeType: string): File {
  const buf = new Uint8Array(sizeBytes).fill(1);
  return new File([buf], "audio.webm", { type: mimeType });
}

describe("POST /api/transcribe", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns transcribed text for a valid audio file", async () => {
    const audio = makeAudioFile(5000, "audio/webm");
    const res = await POST(makeRequest(audio, FAKE_KEY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.text).toBe("Hello world");
  });

  it("returns 400 when no audio is provided", async () => {
    const res = await POST(makeRequest(null, FAKE_KEY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no audio/i);
  });

  it("returns 400 when no API key is provided", async () => {
    const audio = makeAudioFile(5000, "audio/webm");
    const res = await POST(makeRequest(audio, null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no api key/i);
  });

  it("skips transcription and returns empty text for blobs under 2 KB", async () => {
    const tinyAudio = makeAudioFile(500, "audio/webm");
    const res = await POST(makeRequest(tinyAudio, FAKE_KEY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.text).toBe("");
    expect(mockTranscribeCreate).not.toHaveBeenCalled();
  });

  it("normalises MIME type — strips codec spec before sending to Whisper", async () => {
    // "audio/webm;codecs=opus" is what MediaRecorder produces
    const audio = makeAudioFile(5000, "audio/webm;codecs=opus");
    await POST(makeRequest(audio, FAKE_KEY));

    const calledFile: File = mockTranscribeCreate.mock.calls[0][0].file;
    expect(calledFile.type).toBe("audio/webm");
    expect(calledFile.type).not.toContain("codecs");
  });

  it("returns 500 with error message when Groq throws", async () => {
    mockTranscribeCreate.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const audio = makeAudioFile(5000, "audio/webm");
    const res = await POST(makeRequest(audio, FAKE_KEY));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/rate limit/i);
  });
});
