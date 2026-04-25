"use client";
import { useState, useRef, useCallback } from "react";

const MIN_BLOB_BYTES = 10_000;

interface UseAudioRecorderOptions {
  /** Called with each audio blob. May be async — flush awaits it. */
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

  const flush = useCallback(async (): Promise<void> => {
    if (chunksRef.current.length === 0) return;
    const mimeType = mediaRecorderRef.current?.mimeType ?? "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size < MIN_BLOB_BYTES) return;
    await onChunk(blob);
  }, [onChunk]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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

      // 1-second slices let flush() run at any point during the 30s window.
      recorder.start(1000);
      setIsRecording(true);

      intervalRef.current = setInterval(flush, chunkIntervalMs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mic access denied");
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
    // Wait for the recorder to fully stop before flushing the tail.
    setTimeout(flush, 200);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, [flush]);

  return { isRecording, error, start, stop, flush };
}
