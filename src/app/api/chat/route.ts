import { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { MODELS } from "@/lib/defaults";
import type { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transcript,
      chatHistory,
      userMessage,
      prompt,
      apiKey,
      suggestionContext,
      detailedAnswerPrompt,
    } = body as {
      transcript: string;
      chatHistory: ChatMessage[];
      userMessage: string;
      prompt: string;
      apiKey: string;
      suggestionContext?: {
        type: string;
        text: string;
      } | null;
      detailedAnswerPrompt?: string;
    };

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key provided" }), { status: 400 });
    }
    if (!userMessage?.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });
    }

    const groq = new Groq({ apiKey });

    let systemPrompt: string;
    if (suggestionContext && detailedAnswerPrompt) {
      // Detailed answer for a clicked suggestion
      systemPrompt = detailedAnswerPrompt
        .replace("{transcript}", transcript)
        .replace("{suggestion_type}", suggestionContext.type)
        .replace("{suggestion_text}", suggestionContext.text);
    } else {
      // Regular chat
      systemPrompt = prompt.replace("{transcript}", transcript);
    }

    // Build message history for context
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...chatHistory.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    const stream = await groq.chat.completions.create({
      model: MODELS.chat,
      messages,
      temperature: 0.6,
      max_tokens: 4096,
      stream: true,
    });

    // Stream the response back as SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("[chat] Error:", err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
