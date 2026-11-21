import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { SESSION_COOKIE } from "../config/app-config";
import { AuthenticatedRequest } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CredentialsDto } from "./dto/credentials.dto";
import { Public } from "./public.decorator";

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("signup")
  signup(@Body() dto: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    return this.authService.signup(dto, response);
  }

  @Public()
  @Post("login")
  login(@Body() dto: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(dto, response);
  }

  @SkipThrottle()
  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[SESSION_COOKIE];
    await this.authService.logout(typeof token === "string" ? token : undefined, response);
    return { ok: true };
  }

  @SkipThrottle()
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
