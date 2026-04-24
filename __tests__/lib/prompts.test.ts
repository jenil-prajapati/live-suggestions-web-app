import {
  DEFAULT_SUGGESTION_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_CHAT_PROMPT,
} from "@/lib/prompts";

describe("Prompt templates", () => {
  describe("DEFAULT_SUGGESTION_PROMPT", () => {
    it("contains the {transcript} placeholder", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toContain("{transcript}");
    });

    it("specifies exactly 3 suggestions", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/exactly 3/i);
    });

    it("includes all 5 suggestion types in the schema", () => {
      const types = ["question_to_ask", "talking_point", "answer", "fact_check", "clarification"];
      types.forEach((type) => {
        expect(DEFAULT_SUGGESTION_PROMPT).toContain(type);
      });
    });

    it("enforces a 15-word limit on suggestion text", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/15 words/i);
    });

    it("correctly fills the {transcript} placeholder", () => {
      const transcript = "User said: we need to improve our API latency.";
      const filled = DEFAULT_SUGGESTION_PROMPT.replace("{transcript}", transcript);
      expect(filled).toContain(transcript);
      expect(filled).not.toContain("{transcript}");
    });

    it("instructs the model to return only JSON (no markdown)", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/no markdown/i);
    });
  });

  describe("DEFAULT_DETAILED_ANSWER_PROMPT", () => {
    it("contains all required placeholders", () => {
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toContain("{transcript}");
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toContain("{suggestion_type}");
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toContain("{suggestion_text}");
    });

    it("correctly fills all three placeholders", () => {
      const filled = DEFAULT_DETAILED_ANSWER_PROMPT
        .replace("{transcript}", "We discussed Redis vs Memcached.")
        .replace("{suggestion_type}", "fact_check")
        .replace("{suggestion_text}", "Redis supports persistence, Memcached doesn't.");

      expect(filled).toContain("We discussed Redis vs Memcached.");
      expect(filled).toContain("fact_check");
      expect(filled).toContain("Redis supports persistence, Memcached doesn't.");
      expect(filled).not.toContain("{transcript}");
      expect(filled).not.toContain("{suggestion_type}");
      expect(filled).not.toContain("{suggestion_text}");
    });

    it("requests a detailed multi-paragraph response", () => {
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toMatch(/3.{1,5}5 paragraphs/i);
    });
  });

  describe("DEFAULT_CHAT_PROMPT", () => {
    it("contains the {transcript} placeholder", () => {
      expect(DEFAULT_CHAT_PROMPT).toContain("{transcript}");
    });

    it("correctly fills the {transcript} placeholder", () => {
      const transcript = "Team is debating microservices vs monolith.";
      const filled = DEFAULT_CHAT_PROMPT.replace("{transcript}", transcript);
      expect(filled).toContain(transcript);
      expect(filled).not.toContain("{transcript}");
    });

    it("requests longer-form responses", () => {
      expect(DEFAULT_CHAT_PROMPT).toMatch(/3.{1,5}5 paragraphs/i);
    });
  });
});
