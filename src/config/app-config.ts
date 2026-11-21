import { createHash, randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(__dirname, "../.env")];
  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}

loadEnvFile();

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GENERATION_LOCK_MS = 90_000;
export const DEFAULT_CHAT_TITLE = "New chat";
export const MAX_MESSAGE_CHARS = 8000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AppConfig {
  constructor(
    readonly databaseUrl: string,
    readonly openaiApiKey: string,
    readonly port: number,
    readonly nodeEnv: string,
    readonly allowedOrigins: string[],
    readonly modelCandidates: string[],
    readonly openaiTimeoutMs: number,
    readonly openaiMaxOutputTokens: number,
  ) {}
}

function positiveInteger(raw: string | undefined, name: string, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Copy backend/.env.example to backend/.env and set a PostgreSQL connection string.",
    );
  }

  const modelCandidates = (env.OPENAI_MODEL_CANDIDATES ?? "gpt-4.1-mini,gpt-4o-mini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (modelCandidates.length === 0) {
    throw new Error("OPENAI_MODEL_CANDIDATES must list at least one model id.");
  }

  return new AppConfig(
    databaseUrl,
    env.OPENAI_API_KEY?.trim() ?? "",
    positiveInteger(env.PORT, "PORT", 3001),
    env.NODE_ENV ?? "development",
    (env.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    modelCandidates,
    positiveInteger(env.OPENAI_TIMEOUT_MS, "OPENAI_TIMEOUT_MS", 60_000),
    positiveInteger(env.OPENAI_MAX_OUTPUT_TOKENS, "OPENAI_MAX_OUTPUT_TOKENS", 1024),
  );
}

export function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.nodeEnv === "production",
    path: "/",
  };
}
