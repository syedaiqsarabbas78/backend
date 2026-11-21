import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.guard";
import { ChatsService } from "./chats.service";
import { CreateChatDto, SendMessageDto } from "./dto/chat.dto";
import { ListChatsQueryDto, ListMessagesQueryDto } from "./dto/list-query.dto";

@Controller("chats")
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateChatDto) {
    return this.chatsService.create(request.user.id, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ListChatsQueryDto) {
    return this.chatsService.list(request.user.id, query);
  }

  @Delete(":chatId")
  remove(@Req() request: AuthenticatedRequest, @Param("chatId") chatId: string) {
    return this.chatsService.remove(request.user.id, chatId);
  }

  @Get(":chatId/messages")
  messages(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chatsService.listMessages(request.user.id, chatId, query);
  }

  @Post(":chatId/messages")
  send(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatsService.sendMessage(request.user.id, chatId, dto);
  }
}
