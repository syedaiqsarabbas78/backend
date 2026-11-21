import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Message, Model } from "@prisma/client";
import { DEFAULT_CHAT_TITLE, GENERATION_LOCK_MS } from "../config/app-config";
import { OpenAiService } from "../openai/openai.service";
import { httpStatusForOpenAi, OpenAiFailure } from "../openai/openai.errors";
import { PrismaService } from "../prisma/prisma.service";
import { selectContext } from "./context-policy";
import { CreateChatDto, SendMessageDto } from "./dto/chat.dto";
import { ListChatsQueryDto, ListMessagesQueryDto } from "./dto/list-query.dto";

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function titleFrom(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.slice(0, 60) || DEFAULT_CHAT_TITLE;
}

function presentMessage(message: Message) {
  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.status === "failed" ? "" : message.content,
    status: message.status,
    sequence: message.sequence,
    modelId: message.modelId,
    errorCode: message.errorCode,
    createdAt: message.createdAt,
  };
}

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
  ) {}

  async create(userId: string, dto: CreateChatDto) {
    let modelId: string | null = null;
    if (dto.modelId) {
      const model = await this.requireEnabledModel(dto.modelId);
      modelId = model.id;
    }
    const chat = await this.prisma.chat.create({
      data: { userId, title: DEFAULT_CHAT_TITLE, modelId },
    });
    return { chat: this.presentChat(chat) };
  }

  async list(userId: string, query: ListChatsQueryDto) {
    const chats = await this.prisma.chat.findMany({
      where: {
        userId,
        ...(query.before ? { updatedAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: query.limit ?? 30,
    });
    return { chats: chats.map((chat) => this.presentChat(chat)) };
  }

  async remove(userId: string, chatId: string) {
    const deleted = await this.prisma.chat.deleteMany({ where: { id: chatId, userId } });
    if (deleted.count === 0) {
      throw new NotFoundException("Chat not found");
    }
    return { ok: true };
  }

  async listMessages(userId: string, chatId: string, query: ListMessagesQueryDto) {
    await this.requireChat(userId, chatId);
    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(query.beforeSequence ? { sequence: { lt: query.beforeSequence } } : {}),
      },
      orderBy: { sequence: "desc" },
      take: query.limit ?? 50,
    });
    return { messages: messages.reverse().map((message) => presentMessage(message)) };
  }

  async sendMessage(userId: string, chatId: string, dto: SendMessageDto) {
    const chat = await this.requireChat(userId, chatId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException("Message content is required");
    }
    const model = await this.requireEnabledModel(dto.modelId);
    const existing = await this.prisma.message.findFirst({
      where: { chatId, clientRequestId: dto.clientRequestId, role: "user" },
    });
    const userMessage =
      existing ?? (await this.createUserMessage(chat.id, chat.title, content, dto.clientRequestId, model.id));
    const messages = await this.generate(userId, chat.id, userMessage, model);
    const updated = await this.requireChat(userId, chatId);
    return { messages, chat: this.presentChat(updated) };
  }

  private async createUserMessage(
    chatId: string,
    currentTitle: string,
    content: string,
    clientRequestId: string,
    modelId: string,
  ): Promise<Message> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const last = await tx.message.findFirst({
          where: { chatId },
          orderBy: { sequence: "desc" },
        });
        const sequence = (last?.sequence ?? 0) + 1;
        const message = await tx.message.create({
          data: {
            chatId,
            role: "user",
            content,
            status: "completed",
            sequence,
            clientRequestId,
          },
        });
        await tx.chat.update({
          where: { id: chatId },
          data: {
            title: sequence === 1 ? titleFrom(content) : currentTitle,
            modelId,
            updatedAt: new Date(),
          },
        });
        return message;
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const existing = await this.prisma.message.findFirst({
        where: { chatId, clientRequestId, role: "user" },
      });
      if (!existing) {
        throw error;
      }
      return existing;
    }
  }

  private async generate(userId: string, chatId: string, userMessage: Message, model: Model) {
    const assistant = await this.prisma.message.findFirst({
      where: { chatId, role: "assistant", sequence: userMessage.sequence + 1 },
    });
    if (assistant?.status === "completed") {
      return [presentMessage(userMessage), presentMessage(assistant)];
    }

    const chat = await this.requireChat(userId, chatId);
    const lockActive =
      chat.generationLockUntil !== null && chat.generationLockUntil.getTime() > Date.now();
    if (assistant?.status === "pending" && lockActive) {
      throw new ConflictException("A response is already being generated for this chat");
    }

    const requestId = userMessage.clientRequestId ?? userMessage.id;
    const locked = await this.prisma.chat.updateMany({
      where: {
        id: chatId,
        userId,
        OR: [{ generationLockUntil: null }, { generationLockUntil: { lt: new Date() } }],
      },
      data: {
        generationLockUntil: new Date(Date.now() + GENERATION_LOCK_MS),
        generationRequestId: requestId,
      },
    });
    if (locked.count === 0) {
      throw new ConflictException("A response is already being generated for this chat");
    }

    let pending = assistant;
    try {
      if (!pending) {
        pending = await this.prisma.message.create({
          data: {
            chatId,
            role: "assistant",
            content: "",
            status: "pending",
            sequence: userMessage.sequence + 1,
            modelId: model.id,
          },
        });
      } else {
        pending = await this.prisma.message.update({
          where: { id: pending.id },
          data: { status: "pending", content: "", errorCode: null, modelId: model.id },
        });
      }

      const history = await this.prisma.message.findMany({
        where: { chatId, status: "completed" },
        orderBy: { sequence: "asc" },
      });
      const context = selectContext(
        history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      );

      let text: string;
      try {
        text = await this.openai.complete(model.providerModelId, context);
      } catch (error) {
        const failure = error instanceof OpenAiFailure ? error : new OpenAiFailure("provider_error");
        await this.prisma.message.update({
          where: { id: pending.id },
          data: { status: "failed", content: "", errorCode: failure.code, modelId: model.id },
        });
        const status = httpStatusForOpenAi(failure.code);
        throw new HttpException(
          {
            statusCode: status,
            message: "The assistant could not generate a response.",
            code: failure.code,
          },
          status,
        );
      }

      try {
        const saved = await this.prisma.message.update({
          where: { id: pending.id },
          data: { status: "completed", content: text, errorCode: null, modelId: model.id },
        });
        await this.prisma.chat.update({
          where: { id: chatId },
          data: { updatedAt: new Date(), modelId: model.id },
        });
        return [presentMessage(userMessage), presentMessage(saved)];
      } catch {
        throw new InternalServerErrorException({
          statusCode: 500,
          message: "The assistant reply could not be saved.",
          code: "persistence_error",
        });
      }
    } finally {
      await this.prisma.chat.updateMany({
        where: { id: chatId, generationRequestId: requestId },
        data: { generationLockUntil: null, generationRequestId: null },
      });
    }
  }

  private async requireEnabledModel(modelId: string): Promise<Model> {
    const model = await this.prisma.model.findFirst({ where: { id: modelId, enabled: true } });
    if (!model) {
      throw new BadRequestException("Selected model is not available");
    }
    return model;
  }

  private async requireChat(userId: string, chatId: string) {
    const chat = await this.prisma.chat.findFirst({ where: { id: chatId, userId } });
    if (!chat) {
      throw new NotFoundException("Chat not found");
    }
    return chat;
  }

  private presentChat(chat: {
    id: string;
    title: string;
    modelId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: chat.id,
      title: chat.title,
      modelId: chat.modelId,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }
}
