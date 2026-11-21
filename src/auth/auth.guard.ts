import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { SESSION_COOKIE } from "../config/app-config";
import { IS_PUBLIC } from "./public.decorator";
import { AuthService, PublicUser } from "./auth.service";

export type AuthenticatedRequest = Request & { user: PublicUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException("Authentication required");
    }

    const user = await this.authService.validateSession(token);
    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    request.user = user;
    return true;
  }
}
