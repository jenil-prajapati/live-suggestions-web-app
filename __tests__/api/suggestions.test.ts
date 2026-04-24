/**
 * Integration tests for POST /api/suggestions
 *
 * Groq SDK is mocked. Tests cover: happy path, JSON extraction from
 * model output, fallback field names, empty transcript guard, error handling.
 */

const mockCreate = jest.fn();
jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }))
);

import { POST } from "@/app/api/suggestions/route";
import { NextRequest } from "next/server";
import { DEFAULT_SUGGESTION_PROMPT } from "@/lib/prompts";

const FAKE_KEY = "gsk_test_key";

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockGroqResponse(content: string) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content } }],
  });
}

const VALID_SUGGESTIONS = [
  { type: "question_to_ask", text: "What's your p99 latency?" },
  { type: "talking_point", text: "Discord shards at 2,500 guilds per shard." },
  { type: "fact_check", text: "Slack's 2024 outage was a config push, not capacity." },
];

describe("POST /api/suggestions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 3 suggestions for a valid transcript", async () => {
    mockGroqResponse(JSON.stringify(VALID_SUGGESTIONS));

    const res = await POST(
      makeRequest({ transcript: "We are discussing API latency.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0]).toMatchObject({ type: "question_to_ask", text: expect.any(String) });
  });

  it("assigns unique ids to each suggestion", async () => {
    mockGroqResponse(JSON.stringify(VALID_SUGGESTIONS));

    const res = await POST(
      makeRequest({ transcript: "Transcript text.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const { suggestions } = await res.json();
    const ids = suggestions.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("extracts JSON even when the model wraps it in markdown fences", async () => {
    mockGroqResponse("```json\n" + JSON.stringify(VALID_SUGGESTIONS) + "\n```");

    const res = await POST(
      makeRequest({ transcript: "Meeting notes.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
  });

  it("falls back to 'title' field when model ignores the 'text' field name", async () => {
    const withTitleField = VALID_SUGGESTIONS.map(({ type, text }) => ({ type, title: text }));
    mockGroqResponse(JSON.stringify(withTitleField));

    const res = await POST(
      makeRequest({ transcript: "Meeting notes.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions[0].text).toBe(VALID_SUGGESTIONS[0].text);
  });

  it("returns 400 when transcript is empty", async () => {
    const res = await POST(
      makeRequest({ transcript: "   ", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no transcript/i);
  });

  it("returns 400 when API key is missing", async () => {
    const res = await POST(
      makeRequest({ transcript: "Some speech.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: "" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no api key/i);
  });

  it("returns 500 when Groq throws", async () => {
    mockCreate.mockRejectedValue(new Error("Model unavailable"));

    const res = await POST(
      makeRequest({ transcript: "Some speech.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/model unavailable/i);
  });

  it("caps output at 3 suggestions even if model returns more", async () => {
    const fiveSuggestions = [...VALID_SUGGESTIONS, ...VALID_SUGGESTIONS.slice(0, 2)];
    mockGroqResponse(JSON.stringify(fiveSuggestions));

    const res = await POST(
      makeRequest({ transcript: "Meeting notes.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(body.suggestions).toHaveLength(3);
  });
});
