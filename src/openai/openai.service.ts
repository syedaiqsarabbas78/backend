import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AppConfig } from "../config/app-config";
import { mapOpenAiError, OpenAiFailure } from "./openai.errors";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private readonly config: AppConfig) {}

  async complete(model: string, messages: ChatTurn[]): Promise<string> {
    if (!this.config.openaiApiKey) {
      throw new OpenAiFailure("missing_api_key");
    }

    const client = new OpenAI({
      apiKey: this.config.openaiApiKey,
      timeout: this.config.openaiTimeoutMs,
      maxRetries: 0,
    });

    try {
      const result = await client.chat.completions.create({
        model,
        messages,
        max_completion_tokens: this.config.openaiMaxOutputTokens,
      });
      const text = result.choices[0]?.message?.content ?? "";
      if (!text.trim()) {
        throw new OpenAiFailure("empty_response");
      }
      return text;
    } catch (error) {
      const failure = mapOpenAiError(error);
      this.logger.warn(`OpenAI request failed: ${failure.code}`);
      throw failure;
    }
  }
}
