import { selectContext } from "./context-policy";

describe("selectContext", () => {
  it("keeps the newest message and drops older text past the character cap", () => {
    const messages = [
      { role: "user" as const, content: "a".repeat(12_000) },
      { role: "assistant" as const, content: "b".repeat(12_000) },
      { role: "user" as const, content: "latest" },
    ];
    expect(selectContext(messages)).toEqual([{ role: "user", content: "latest" }]);
  });

  it("keeps at most 20 messages", () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      role: "user" as const,
      content: `m${index}`,
    }));
    const selected = selectContext(messages);
    expect(selected).toHaveLength(20);
    expect(selected[0].content).toBe("m5");
    expect(selected[19].content).toBe("m24");
  });
});
