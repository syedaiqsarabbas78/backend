import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        response.status(status).json({ statusCode: status, message: body });
        return;
      }
      const record = body as { message?: string | string[]; code?: string };
      const message = Array.isArray(record.message)
        ? record.message.join(", ")
        : (record.message ?? exception.message);
      response.status(status).json({
        statusCode: status,
        message,
        ...(record.code
          ? { code: record.code }
          : status === HttpStatus.BAD_REQUEST
            ? { code: "validation_error" }
            : {}),
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.name : "UnknownException");
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      code: "internal_error",
    });
  }
}
