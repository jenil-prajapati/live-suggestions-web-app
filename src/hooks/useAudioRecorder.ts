"use client";
import { useState, useRef, useCallback } from "react";

interface UseAudioRecorderOptions {
  /** Called with each audio blob. Can be async — flush awaits it before returning. */
  onChunk: (blob: Blob) => Promise<void> | void;
  chunkIntervalMs?: number;
}

export function useAudioRecorder({ onChunk, chunkIntervalMs = 30000 }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Builds a blob from buffered slices, clears the buffer, and calls onChunk. */
  const flush = useCallback(async (): Promise<void> => {
    if (chunksRef.current.length === 0) return;
    const mimeType = mediaRecorderRef.current?.mimeType ?? "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    await onChunk(blob);
  }, [onChunk]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported MIME type — Whisper accepts webm, mp4, ogg, etc.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect 1-second slices so flush works at any time
      setIsRecording(true);

      // Auto-flush every chunkIntervalMs
      intervalRef.current = setInterval(flush, chunkIntervalMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mic access denied";
      setError(msg);
    }
  }, [flush, chunkIntervalMs]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    // Flush any remaining audio after the recorder has fully stopped
    setTimeout(flush, 200);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, [flush]);

  return { isRecording, error, start, stop, flush };
}
