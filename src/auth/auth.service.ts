import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Response } from "express";
import * as argon2 from "argon2";
import {
  cookieOptions,
  createSessionToken,
  hashToken,
  normalizeEmail,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "../config/app-config";
import { AppConfig } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsDto } from "./dto/credentials.dto";

export interface PublicUser {
  id: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async signup(dto: CredentialsDto, response: Response): Promise<{ user: PublicUser }> {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });
    return this.startSession(user, response);
  }

  async login(dto: CredentialsDto, response: Response): Promise<{ user: PublicUser }> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const matches = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!matches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.startSession(user, response);
  }

  async logout(token: string | undefined, response: Response): Promise<void> {
    if (token) {
      await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    response.clearCookie(SESSION_COOKIE, cookieOptions(this.config));
  }

  async validateSession(token: string): Promise<PublicUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return { id: session.user.id, email: session.user.email };
  }

  private async startSession(
    user: { id: string; email: string },
    response: Response,
  ): Promise<{ user: PublicUser }> {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt,
      },
    });
    response.cookie(SESSION_COOKIE, token, {
      ...cookieOptions(this.config),
      expires: expiresAt,
    });
    return { user: { id: user.id, email: user.email } };
  }
}
