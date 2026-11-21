import { IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";

export class ListChatsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class ListMessagesQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  beforeSequence?: number;
}
