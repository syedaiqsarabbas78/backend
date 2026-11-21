import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AppConfig } from "../config/app-config";

function originFromReferer(referer: string): string {
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

@Injectable()
export class OriginMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
      next();
      return;
    }

    const headerOrigin = request.headers.origin;
    const headerReferer = request.headers.referer;
    const origin =
      typeof headerOrigin === "string" && headerOrigin.length > 0
        ? headerOrigin
        : typeof headerReferer === "string"
          ? originFromReferer(headerReferer)
          : "";

    if (!this.config.allowedOrigins.includes(origin)) {
      throw new ForbiddenException("Request origin is not allowed");
    }

    next();
  }
}
