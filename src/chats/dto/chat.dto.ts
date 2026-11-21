import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateChatDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  modelId?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsString()
  @MinLength(1)
  modelId!: string;

  @IsUUID()
  clientRequestId!: string;
}
