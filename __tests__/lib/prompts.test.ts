import {
  DEFAULT_SUGGESTION_PROMPT,
  DEFAULT_DETAILED_ANSWER_PROMPT,
  DEFAULT_CHAT_PROMPT,
} from "@/lib/prompts";

describe("Prompt templates", () => {
  describe("DEFAULT_SUGGESTION_PROMPT", () => {
    it("contains the new {latest_chunk} and {prior_context} placeholders", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toContain("{latest_chunk}");
      expect(DEFAULT_SUGGESTION_PROMPT).toContain("{prior_context}");
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

    it("enforces a tight word limit on suggestion text", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/\d+ words/i);
    });

    it("enforces role diversity (each of the 3 must be a different type)", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/different role|different\s+type|never produce 3 suggestions of the same type/i);
    });

    it("anchors suggestions to the latest turn", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/latest turn/i);
    });

    it("correctly fills {latest_chunk} and {prior_context}", () => {
      const filled = DEFAULT_SUGGESTION_PROMPT
        .replace("{latest_chunk}", "We need to improve API latency.")
        .replace("{prior_context}", "Earlier we discussed scaling.");
      expect(filled).toContain("We need to improve API latency.");
      expect(filled).toContain("Earlier we discussed scaling.");
      expect(filled).not.toContain("{latest_chunk}");
      expect(filled).not.toContain("{prior_context}");
    });

    it("specifies JSON-object response schema", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/suggestions/i);
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/JSON/i);
    });

    it("guards against invented stats", () => {
      expect(DEFAULT_SUGGESTION_PROMPT).toMatch(/never invent|do not invent/i);
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

    it("instructs the copilot tone (not consultant)", () => {
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toMatch(/copilot/i);
    });

    it("forbids inventing numbers", () => {
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toMatch(/never invent|do not invent|do not.*invent/i);
    });

    it("does NOT force a follow-up question (only ends with one when it sharpens the next turn)", () => {
      expect(DEFAULT_DETAILED_ANSWER_PROMPT).toMatch(/do not always end with a question/i);
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

    it("instructs the copilot tone (not consultant)", () => {
      expect(DEFAULT_CHAT_PROMPT).toMatch(/copilot/i);
    });

    it("forbids inventing numbers", () => {
      expect(DEFAULT_CHAT_PROMPT).toMatch(/never invent|do not invent|do not.*invent/i);
    });

    it("does NOT force a follow-up question", () => {
      expect(DEFAULT_CHAT_PROMPT).toMatch(/do not always end with a question/i);
    });
  });
});
