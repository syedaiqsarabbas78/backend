export class OpenAiFailure extends Error {
  constructor(readonly code: OpenAiErrorCode) {
    super(code);
  }
}

export type OpenAiErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "insufficient_quota"
  | "rate_limited"
  | "model_unavailable"
  | "timeout"
  | "empty_response"
  | "provider_error";

export function httpStatusForOpenAi(code: OpenAiErrorCode): number {
  if (
    code === "missing_api_key" ||
    code === "invalid_api_key" ||
    code === "insufficient_quota" ||
    code === "rate_limited" ||
    code === "timeout"
  ) {
    return 503;
  }
  return 502;
}

export function mapOpenAiError(error: unknown): OpenAiFailure {
  if (error instanceof OpenAiFailure) {
    return error;
  }

  const status = readNumber(error, "status");
  const code = readString(error, "code");
  const name = error instanceof Error ? error.name : (readString(error, "name") ?? "");

  if (status === 401) {
    return new OpenAiFailure("invalid_api_key");
  }
  if (status === 429) {
    return new OpenAiFailure(code === "insufficient_quota" ? "insufficient_quota" : "rate_limited");
  }
  if (status === 404 || status === 400) {
    return new OpenAiFailure("model_unavailable");
  }
  if (
    name === "APIConnectionTimeoutError" ||
    name === "TimeoutError" ||
    code === "ETIMEDOUT" ||
    code === "timeout"
  ) {
    return new OpenAiFailure("timeout");
  }
  return new OpenAiFailure("provider_error");
}

function readNumber(error: unknown, key: string): number | undefined {
  if (typeof error === "object" && error !== null && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function readString(error: unknown, key: string): string | undefined {
  if (typeof error === "object" && error !== null && key in error) {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}
