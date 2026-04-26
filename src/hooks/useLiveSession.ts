"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  SessionSettings,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/types";
import {
  fetchSuggestions as apiFetchSuggestions,
  streamChat,
  transcribeAudio,
} from "@/lib/api";
import { useAudioRecorder } from "./useAudioRecorder";

/**
 * useLiveSession — single source of truth for the live copilot pipeline.
 *
 *   audio chunk → transcribe → commit chunk to state → build context
 *               → request suggestions → commit batch
 *
 * Why a dedicated hook:
 *   - Guarantees ordering: a suggestion batch is never produced before the
 *     transcript chunk it was built from is committed to state.
 *   - Prevents concurrent suggestion requests (the auto-timer cannot fire
 *     while a request is already in flight).
 *   - Keeps the page component focused on rendering, not orchestration.
 *
 * Concurrency model:
 *   - `pipelineLockRef`        — true while a transcribe→commit→suggest cycle is running.
 *   - `suggestionsInFlightRef` — true while an isolated suggestion request is running
 *                                (used by the auto-timer to skip overlapping ticks).
 */

interface UseLiveSessionArgs {
  settings: SessionSettings;
  onMissingApiKey: () => void;
}

export interface LiveSession {
  // Transcript
  transcriptChunks: TranscriptChunk[];
  isTranscribing: boolean;
  transcribeError: string | null;

  // Suggestions
  suggestionBatches: SuggestionBatch[];
  isSuggestionsLoading: boolean;
  nextRefreshIn: number;

  // Recording
  isRecording: boolean;
  micError: string | null;
  start: () => void;
  stop: () => void;
  manualRefresh: () => Promise<void>;

  // Chat
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  sendChat: (text: string) => Promise<void>;
  clickSuggestion: (suggestion: Suggestion, batchId: string) => Promise<void>;

  // Session metadata
  sessionStartedAt: number | null;
}

export function useLiveSession({ settings, onMissingApiKey }: UseLiveSessionArgs): LiveSession {
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  // Refs that always reflect the latest state, used inside timers / closures.
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const isRecordingRef = useRef(false);
  const pipelineLockRef = useRef(false);
  const suggestionsInFlightRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    transcriptChunksRef.current = transcriptChunks;
  }, [transcriptChunks]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  /** Builds the suggestion request payload from a transcript snapshot. */
  const buildSuggestionContext = useCallback(
    (chunks: TranscriptChunk[]) => {
      if (chunks.length === 0) return null;
      const latest = chunks[chunks.length - 1];
      const earlier = chunks.slice(0, -1).map((c) => c.text).join(" ");
      // priorContext is bounded; we want the suggestion model to focus on the
      // latest turn, not get drowned by older transcript.
      const priorContext = earlier.slice(-Math.max(0, settings.suggestionContextChars - latest.text.length));
      return { latestChunk: latest, priorContext };
    },
    [settings.suggestionContextChars]
  );

  /** Builds the wider transcript window used by chat / detailed answers. */
  const buildChatTranscript = useCallback(() => {
    const full = transcriptChunksRef.current.map((c) => c.text).join(" ");
    return full.slice(-settings.detailedAnswerContextChars);
  }, [settings.detailedAnswerContextChars]);

  /** Generates a suggestion batch from the CURRENT transcript snapshot. */
  const generateBatchFromCurrentTranscript = useCallback(async () => {
    if (suggestionsInFlightRef.current) return;
    if (!settings.groqApiKey) {
      onMissingApiKey();
      return;
    }
    const ctx = buildSuggestionContext(transcriptChunksRef.current);
    if (!ctx) return;

    suggestionsInFlightRef.current = true;
    setIsSuggestionsLoading(true);
    try {
      const suggestions = await apiFetchSuggestions({
        latestChunk: ctx.latestChunk.text,
        priorContext: ctx.priorContext,
        prompt: settings.suggestionPrompt,
        apiKey: settings.groqApiKey,
      });
      if (suggestions.length > 0) {
        setSuggestionBatches((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            timestamp: Date.now(),
            basedOnChunkId: ctx.latestChunk.id,
            suggestions,
          },
        ]);
      }
    } catch (err) {
      console.error("[suggestions]", err);
    } finally {
      suggestionsInFlightRef.current = false;
      setIsSuggestionsLoading(false);
    }
  }, [buildSuggestionContext, onMissingApiKey, settings.groqApiKey, settings.suggestionPrompt]);

  /**
   * One full pipeline cycle:
   *   1. transcribe the audio blob
   *   2. commit the new chunk to transcript state (await the commit)
   *   3. generate suggestions from a snapshot that *includes* the new chunk
   *
   * This is serialised by `pipelineLockRef` so two cycles can't interleave.
   */
  const runPipeline = useCallback(
    async (blob: Blob | null) => {
      if (pipelineLockRef.current) return;
      pipelineLockRef.current = true;
      try {
        if (!settings.groqApiKey) {
          onMissingApiKey();
          return;
        }

        // Step 1: transcribe (only if we have audio).
        let newChunk: TranscriptChunk | null = null;
        if (blob) {
          setIsTranscribing(true);
          setTranscribeError(null);
          try {
            const { text } = await transcribeAudio(blob, settings.groqApiKey);
            if (text.trim()) {
              newChunk = {
                id: `c-${Date.now()}`,
                text: text.trim(),
                timestamp: Date.now(),
              };
            }
          } catch (err) {
            setTranscribeError(err instanceof Error ? err.message : "Transcription failed");
          } finally {
            setIsTranscribing(false);
          }
        }

        // Step 2: commit chunk and wait for state to reflect it before suggesting.
        if (newChunk) {
          await new Promise<void>((resolve) => {
            setTranscriptChunks((prev) => {
              const next = [...prev, newChunk!];
              transcriptChunksRef.current = next;
              return next;
            });
            // Defer to next microtask so React has scheduled the update.
            queueMicrotask(resolve);
          });
        }

        // Step 3: only generate suggestions if we have *some* transcript.
        if (transcriptChunksRef.current.length === 0) return;
        await generateBatchFromCurrentTranscript();
      } finally {
        pipelineLockRef.current = false;
      }
    },
    [generateBatchFromCurrentTranscript, onMissingApiKey, settings.groqApiKey]
  );

  // Audio recorder feeds blobs into the pipeline.
  const handleAudioChunk = useCallback(
    async (blob: Blob) => {
      await runPipeline(blob);
    },
    [runPipeline]
  );

  const recorder = useAudioRecorder({
    onChunk: handleAudioChunk,
    chunkIntervalMs: settings.refreshIntervalMs,
  });

  useEffect(() => {
    isRecordingRef.current = recorder.isRecording;
  }, [recorder.isRecording]);

  // Auto-refresh countdown ticks while the pipeline runs on audio chunks.
  // The pipeline itself is driven by audio flushes, so the countdown here
  // is purely a UI signal — it resets when a batch lands.
  useEffect(() => {
    if (!recorder.isRecording) {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      refreshTimerRef.current = null;
      countdownRef.current = null;
      setNextRefreshIn(0);
      return;
    }

    setNextRefreshIn(settings.refreshIntervalMs);

    countdownRef.current = setInterval(() => {
      setNextRefreshIn((prev) => (prev <= 1000 ? settings.refreshIntervalMs : prev - 1000));
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [recorder.isRecording, settings.refreshIntervalMs]);

  // When a new batch lands, reset the countdown so the UI matches reality.
  useEffect(() => {
    if (recorder.isRecording) setNextRefreshIn(settings.refreshIntervalMs);
  }, [suggestionBatches.length, recorder.isRecording, settings.refreshIntervalMs]);

  const start = useCallback(() => {
    if (!settings.groqApiKey) {
      onMissingApiKey();
      return;
    }
    if (sessionStartedAt === null) setSessionStartedAt(Date.now());
    recorder.start();
  }, [onMissingApiKey, recorder, sessionStartedAt, settings.groqApiKey]);

  const stop = useCallback(() => {
    recorder.stop();
  }, [recorder]);

  /**
   * Manual refresh always follows the same ordering as the auto-pipeline:
   *   flush audio → transcribe → commit chunk → generate suggestions.
   * If recording is off, just regenerate from current transcript.
   */
  const manualRefresh = useCallback(async () => {
    if (recorder.isRecording) {
      await recorder.flush();
      // recorder.flush triggers handleAudioChunk → runPipeline. Done.
      return;
    }
    await generateBatchFromCurrentTranscript();
  }, [generateBatchFromCurrentTranscript, recorder]);

  // ----- Chat -----

  const sendChatInternal = useCallback(
    async (args: {
      content: string;
      suggestion: Suggestion | null;
      batchId: string | null;
    }) => {
      const { content, suggestion, batchId } = args;
      if (!settings.groqApiKey) {
        onMissingApiKey();
        return;
      }
      if (!content.trim()) return;

      const typeLabels: Record<string, string> = {
        question_to_ask: "Question to ask",
        talking_point: "Talking point",
        answer: "Answer",
        fact_check: "Fact-check",
        clarification: "Clarification",
      };

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: suggestion ? suggestion.text : content,
        timestamp: Date.now(),
        suggestionRef: suggestion ? typeLabels[suggestion.type] : undefined,
        suggestionBatchId: suggestion && batchId ? batchId : undefined,
        suggestionId: suggestion ? suggestion.id : undefined,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingContent("");

      const transcript = buildChatTranscript();
      const history = chatMessagesRef.current.slice(-10);

      try {
        // For suggestion clicks, the userMessage is just the suggestion text;
        // the detailedAnswerPrompt template handles transcript + suggestion fields.
        // We pass a placeholder to satisfy "non-empty userMessage" without
        // duplicating content the template already includes.
        const userMessageForApi = suggestion ? "(expand this suggestion)" : content;

        const full = await streamChat(
          {
            transcript,
            chatHistory: history,
            userMessage: userMessageForApi,
            prompt: settings.chatPrompt,
            apiKey: settings.groqApiKey,
            suggestionContext: suggestion
              ? { type: suggestion.type, text: suggestion.text }
              : null,
            detailedAnswerPrompt: suggestion ? settings.detailedAnswerPrompt : undefined,
          },
          (delta) => setStreamingContent((prev) => prev + delta)
        );

        setChatMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: full,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [
      buildChatTranscript,
      onMissingApiKey,
      settings.chatPrompt,
      settings.detailedAnswerPrompt,
      settings.groqApiKey,
    ]
  );

  const sendChat = useCallback(
    (text: string) => sendChatInternal({ content: text, suggestion: null, batchId: null }),
    [sendChatInternal]
  );

  const clickSuggestion = useCallback(
    (suggestion: Suggestion, batchId: string) =>
      sendChatInternal({ content: suggestion.text, suggestion, batchId }),
    [sendChatInternal]
  );

  // Cleanup any timers on unmount.
  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    },
    []
  );

  return {
    transcriptChunks,
    isTranscribing,
    transcribeError,

    suggestionBatches,
    isSuggestionsLoading,
    nextRefreshIn,

    isRecording: recorder.isRecording,
    micError: recorder.error,
    start,
    stop,
    manualRefresh,

    chatMessages,
    isStreaming,
    streamingContent,
    sendChat,
    clickSuggestion,

    sessionStartedAt,
  };
}
