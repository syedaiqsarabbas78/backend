import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ChatsService } from "./chats.service";
import { OpenAiFailure } from "../openai/openai.errors";
import { OpenAiService } from "../openai/openai.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../test/fake-prisma";

describe("ChatsService", () => {
  let fake: FakePrisma;
  let complete: jest.Mock;
  let service: ChatsService;
  let modelId: string;
  let disabledModelId: string;
  let chatA: string;
  let chatB: string;

  beforeEach(async () => {
    fake = new FakePrisma();
    fake.models.push({
      id: "model_enabled",
      providerModelId: "gpt-4.1-mini",
      displayName: "GPT 4.1 mini",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    fake.models.push({
      id: "model_disabled",
      providerModelId: "gpt-4o-mini",
      displayName: "GPT 4o mini",
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    modelId = "model_enabled";
    disabledModelId = "model_disabled";
    complete = jest.fn().mockResolvedValue("Hello from the model");
    service = new ChatsService(fake as unknown as PrismaService, { complete } as unknown as OpenAiService);
    chatA = (await service.create("user_a", {})).chat.id;
    chatB = (await service.create("user_b", {})).chat.id;
  });

  it("lists only the authenticated user's chats", async () => {
    const listed = await service.list("user_a", {});
    expect(listed.chats.map((chat) => chat.id)).toEqual([chatA]);
  });

  it("hides another user's messages, sends, and deletes", async () => {
    await expect(service.listMessages("user_a", chatB, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.sendMessage("user_a", chatB, {
        content: "secret",
        modelId,
        clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445566",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove("user_a", chatB)).rejects.toBeInstanceOf(NotFoundException);
    expect(complete).not.toHaveBeenCalled();
    expect(fake.chats.some((chat) => chat.id === chatB)).toBe(true);
  });

  it("rejects a disabled model", async () => {
    await expect(
      service.sendMessage("user_a", chatA, {
        content: "hello",
        modelId: disabledModelId,
        clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445567",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("persists the user message and the assistant reply", async () => {
    const result = await service.sendMessage("user_a", chatA, {
      content: "  First question  ",
      modelId,
      clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445568",
    });
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.messages[1].content).toBe("Hello from the model");
    expect(result.messages[1].status).toBe("completed");
    expect(result.chat.title).toBe("First question");
    expect(fake.messages).toHaveLength(2);
    expect(complete).toHaveBeenCalledWith("gpt-4.1-mini", [
      { role: "user", content: "First question" },
    ]);
  });

  it("keeps the user message and stores a failed assistant row when OpenAI fails", async () => {
    complete.mockRejectedValueOnce(new OpenAiFailure("missing_api_key"));
    await expect(
      service.sendMessage("user_a", chatA, {
        content: "hello",
        modelId,
        clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445569",
      }),
    ).rejects.toBeInstanceOf(HttpException);
    const userMessage = fake.messages.find((message) => message.role === "user");
    const assistant = fake.messages.find((message) => message.role === "assistant");
    expect(userMessage?.status).toBe("completed");
    expect(assistant?.status).toBe("failed");
    expect(assistant?.content).toBe("");
    expect(assistant?.errorCode).toBe("missing_api_key");
  });

  it("does not call OpenAI again for a completed idempotency key", async () => {
    const dto = {
      content: "hello",
      modelId,
      clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445570",
    };
    await service.sendMessage("user_a", chatA, dto);
    await service.sendMessage("user_a", chatA, dto);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(fake.messages.filter((message) => message.role === "user")).toHaveLength(1);
  });

  it("rejects a duplicate send while generation is in flight", async () => {
    const dto = {
      content: "hello",
      modelId,
      clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445571",
    };
    let release: (() => void) | undefined;
    complete.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve("done");
        }),
    );
    const first = service.sendMessage("user_a", chatA, dto);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(service.sendMessage("user_a", chatA, dto)).rejects.toBeInstanceOf(ConflictException);
    release?.();
    await first;
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("returns a persistence error without marking the reply successful", async () => {
    fake.failCompletedUpdate = true;
    await expect(
      service.sendMessage("user_a", chatA, {
        content: "hello",
        modelId,
        clientRequestId: "5d0b9c2e-3f0a-4a1b-9c8d-112233445572",
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    const assistant = fake.messages.find((message) => message.role === "assistant");
    expect(assistant?.status).not.toBe("completed");
  });
});
