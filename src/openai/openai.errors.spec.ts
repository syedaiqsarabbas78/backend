import { mapOpenAiError, OpenAiFailure } from "./openai.errors";

describe("mapOpenAiError", () => {
  it("maps authentication, quota, and timeout failures", () => {
    expect(mapOpenAiError({ status: 401 }).code).toBe("invalid_api_key");
    expect(mapOpenAiError({ status: 429, code: "insufficient_quota" }).code).toBe("insufficient_quota");
    expect(mapOpenAiError({ status: 429 }).code).toBe("rate_limited");
    expect(mapOpenAiError({ name: "APIConnectionTimeoutError" }).code).toBe("timeout");
    expect(mapOpenAiError(new OpenAiFailure("empty_response")).code).toBe("empty_response");
  });
});
