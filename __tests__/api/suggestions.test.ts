/**
 * Integration tests for POST /api/suggestions
 *
 * Groq SDK is mocked. Tests cover: happy path, JSON extraction,
 * fallback field names, latest-chunk/prior-context routing,
 * dedup, empty input guard, and error handling.
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
  { type: "question_to_ask", text: "Are you optimizing for topic match instead of next-turn usefulness?" },
  { type: "talking_point", text: "Force one question, one challenge, one clarification per batch." },
  { type: "fact_check", text: "30s is a UX choice, not a model constraint — verify the assumption." },
];

describe("POST /api/suggestions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 3 suggestions for the new latestChunk/priorContext shape", async () => {
    mockGroqResponse(JSON.stringify({ suggestions: VALID_SUGGESTIONS }));

    const res = await POST(
      makeRequest({
        latestChunk: "Our suggestions feel generic.",
        priorContext: "Earlier we talked about API latency.",
        prompt: DEFAULT_SUGGESTION_PROMPT,
        apiKey: FAKE_KEY,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0]).toMatchObject({ type: "question_to_ask", text: expect.any(String) });

    // Verify the prompt sent to Groq was filled with both placeholders.
    const sentMessage = mockCreate.mock.calls[0][0].messages[0].content;
    expect(sentMessage).toContain("Our suggestions feel generic.");
    expect(sentMessage).toContain("Earlier we talked about API latency.");
  });

  it("still accepts the legacy 'transcript' field (back-compat)", async () => {
    mockGroqResponse(JSON.stringify({ suggestions: VALID_SUGGESTIONS }));

    const res = await POST(
      makeRequest({ transcript: "We are discussing API latency.", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
  });

  it("assigns unique ids to each suggestion", async () => {
    mockGroqResponse(JSON.stringify({ suggestions: VALID_SUGGESTIONS }));

    const res = await POST(
      makeRequest({ latestChunk: "Latest line.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const { suggestions } = await res.json();
    const ids = suggestions.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("extracts a bare array even when model ignores json_object mode", async () => {
    // No outer object key — fallback regex should still find the array.
    mockGroqResponse(JSON.stringify(VALID_SUGGESTIONS));

    const res = await POST(
      makeRequest({ latestChunk: "Meeting notes.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(3);
  });

  it("falls back to 'title' field when model ignores the 'text' field name", async () => {
    const withTitleField = VALID_SUGGESTIONS.map(({ type, text }) => ({ type, title: text }));
    mockGroqResponse(JSON.stringify({ suggestions: withTitleField }));

    const res = await POST(
      makeRequest({ latestChunk: "Meeting notes.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.suggestions[0].text).toBe(VALID_SUGGESTIONS[0].text);
  });

  it("dedupes near-identical suggestions and trims to 3 unique cards", async () => {
    const dupes = [
      VALID_SUGGESTIONS[0],
      VALID_SUGGESTIONS[0], // exact duplicate
      VALID_SUGGESTIONS[1],
      VALID_SUGGESTIONS[2],
    ];
    mockGroqResponse(JSON.stringify({ suggestions: dupes }));

    const res = await POST(
      makeRequest({ latestChunk: "Notes.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(body.suggestions).toHaveLength(3);
    const texts = body.suggestions.map((s: { text: string }) => s.text);
    expect(new Set(texts).size).toBe(3);
  });

  it("normalises an unknown 'type' to 'talking_point'", async () => {
    mockGroqResponse(JSON.stringify({
      suggestions: [
        { type: "made_up_type", text: "First" },
        { type: "talking_point", text: "Second" },
        { type: "answer", text: "Third" },
      ],
    }));

    const res = await POST(
      makeRequest({ latestChunk: "Notes.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(body.suggestions[0].type).toBe("talking_point");
  });

  it("returns 400 when both latestChunk and transcript are empty", async () => {
    const res = await POST(
      makeRequest({ latestChunk: "   ", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no transcript/i);
  });

  it("returns 400 when API key is missing", async () => {
    const res = await POST(
      makeRequest({ latestChunk: "Some speech.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: "" })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no api key/i);
  });

  it("returns 500 when Groq throws", async () => {
    mockCreate.mockRejectedValue(new Error("Model unavailable"));

    const res = await POST(
      makeRequest({ latestChunk: "Some speech.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/model unavailable/i);
  });

  it("caps output at 3 suggestions even if model returns more", async () => {
    const five = [
      ...VALID_SUGGESTIONS,
      { type: "clarification", text: "Define 'generic' before tuning prompts." },
      { type: "answer", text: "Force role diversity in each batch." },
    ];
    mockGroqResponse(JSON.stringify({ suggestions: five }));

    const res = await POST(
      makeRequest({ latestChunk: "Meeting notes.", priorContext: "", prompt: DEFAULT_SUGGESTION_PROMPT, apiKey: FAKE_KEY })
    );
    const body = await res.json();
    expect(body.suggestions).toHaveLength(3);
  });
});
