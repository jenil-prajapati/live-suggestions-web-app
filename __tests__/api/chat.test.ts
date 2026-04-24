/**
 * Integration tests for POST /api/chat
 *
 * Groq SDK is mocked to return a simple SSE stream.
 * Tests cover: happy-path streaming, suggestion vs direct-chat prompt routing,
 * empty-message guard, missing API key, and Groq error handling.
 */

const mockStreamCreate = jest.fn();
jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockStreamCreate } },
  }))
);

import { POST } from "@/app/api/chat/route";
import { NextRequest } from "next/server";
import { DEFAULT_CHAT_PROMPT, DEFAULT_DETAILED_ANSWER_PROMPT } from "@/lib/prompts";

const FAKE_KEY = "gsk_test_key";

/** Builds a mock async-iterable stream of SSE deltas */
function mockStream(tokens: string[]) {
  const chunks = tokens.map((t) => ({ choices: [{ delta: { content: t } }] }));
  const asyncIterable = {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
  mockStreamCreate.mockResolvedValue(asyncIterable);
}

async function readSSEBody(res: Response): Promise<string> {
  const text = await res.text();
  let result = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      try {
        const { delta } = JSON.parse(line.slice(6));
        result += delta;
      } catch { /* skip */ }
    }
  }
  return result;
}

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => jest.clearAllMocks());

  it("streams a response for a direct user message", async () => {
    mockStream(["The ", "answer ", "is 42."]);

    const res = await POST(makeRequest({
      transcript: "We discussed pricing.",
      chatHistory: [],
      userMessage: "What should we charge?",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: null,
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await readSSEBody(res);
    expect(body).toBe("The answer is 42.");
  });

  it("uses detailedAnswerPrompt when a suggestion is clicked", async () => {
    mockStream(["Detailed answer here."]);

    await POST(makeRequest({
      transcript: "We talked about Redis.",
      chatHistory: [],
      userMessage: "Redis Cluster handles ~1M ops/sec/node.",
      prompt: DEFAULT_CHAT_PROMPT,
      detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: { type: "talking_point", text: "Redis Cluster handles ~1M ops/sec/node." },
    }));

    const [callArgs] = mockStreamCreate.mock.calls;
    const systemMessage = callArgs[0].messages[0];
    // Detailed answer prompt fills {suggestion_type} and {suggestion_text}
    expect(systemMessage.content).toContain("talking_point");
    expect(systemMessage.content).toContain("Redis Cluster handles ~1M ops/sec/node.");
  });

  it("uses chatPrompt for direct messages (no suggestion context)", async () => {
    mockStream(["Here is my answer."]);

    await POST(makeRequest({
      transcript: "We discussed onboarding.",
      chatHistory: [],
      userMessage: "How do we fix drop-off?",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: null,
    }));

    const systemMessage = mockStreamCreate.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("We discussed onboarding.");
    // Should NOT contain suggestion placeholders
    expect(systemMessage.content).not.toContain("{suggestion_type}");
  });

  it("includes chat history in the messages array", async () => {
    mockStream(["Follow-up answer."]);

    const history = [
      { id: "1", role: "user" as const, content: "First question", timestamp: 0 },
      { id: "2", role: "assistant" as const, content: "First answer", timestamp: 1 },
    ];

    await POST(makeRequest({
      transcript: "Meeting context.",
      chatHistory: history,
      userMessage: "Follow-up question",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: null,
    }));

    const messages = mockStreamCreate.mock.calls[0][0].messages;
    // system + 2 history + 1 current = 4
    expect(messages).toHaveLength(4);
    expect(messages[1].content).toBe("First question");
    expect(messages[2].content).toBe("First answer");
  });

  it("returns 400 for an empty user message", async () => {
    const res = await POST(makeRequest({
      transcript: "Some context.",
      chatHistory: [],
      userMessage: "   ",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: null,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty message/i);
  });

  it("returns 400 when API key is missing", async () => {
    const res = await POST(makeRequest({
      transcript: "Context.",
      chatHistory: [],
      userMessage: "Hello",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: "",
      suggestionContext: null,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no api key/i);
  });

  it("returns 500 when Groq throws", async () => {
    mockStreamCreate.mockRejectedValue(new Error("Context length exceeded"));

    const res = await POST(makeRequest({
      transcript: "Context.",
      chatHistory: [],
      userMessage: "What should we do?",
      prompt: DEFAULT_CHAT_PROMPT,
      apiKey: FAKE_KEY,
      suggestionContext: null,
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/context length/i);
  });
});
