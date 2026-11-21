import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { readConfig, SESSION_COOKIE } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../test/fake-prisma";

function mockResponse() {
  const set: Array<{ name: string; value: string }> = [];
  let cleared = false;
  return {
    set,
    get cleared() {
      return cleared;
    },
    cookie(name: string, value: string) {
      set.push({ name, value });
    },
    clearCookie() {
      cleared = true;
    },
  };
}

describe("AuthService", () => {
  let fake: FakePrisma;
  let service: AuthService;
  const config = readConfig();

  beforeEach(() => {
    fake = new FakePrisma();
    service = new AuthService(fake as unknown as PrismaService, config);
  });

  it("stores a hashed password and returns a public user", async () => {
    const response = mockResponse();
    const result = await service.signup(
      { email: " Ada@Example.com ", password: "password123" },
      response as never,
    );
    expect(result.user.email).toBe("ada@example.com");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(fake.users[0].passwordHash).not.toBe("password123");
    expect(await argon2.verify(fake.users[0].passwordHash, "password123")).toBe(true);
    expect(fake.sessions[0].tokenHash).not.toBe(response.set[0].value);
    expect(response.set[0].name).toBe(SESSION_COOKIE);
  });

  it("rejects a duplicate email", async () => {
    const response = mockResponse();
    await service.signup({ email: "ada@example.com", password: "password123" }, response as never);
    await expect(
      service.signup({ email: "ada@example.com", password: "password123" }, response as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs in with the same credentials and rejects a wrong password", async () => {
    const response = mockResponse();
    await service.signup({ email: "ada@example.com", password: "password123" }, response as never);
    const loggedIn = await service.login(
      { email: "ada@example.com", password: "password123" },
      response as never,
    );
    expect(loggedIn.user.email).toBe("ada@example.com");
    await expect(
      service.login({ email: "ada@example.com", password: "wrong-password" }, response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("invalidates the session on logout", async () => {
    const response = mockResponse();
    await service.signup({ email: "ada@example.com", password: "password123" }, response as never);
    const token = response.set[0].value;
    expect(await service.validateSession(token)).not.toBeNull();
    await service.logout(token, response as never);
    expect(response.cleared).toBe(true);
    expect(await service.validateSession(token)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const response = mockResponse();
    await service.signup({ email: "ada@example.com", password: "password123" }, response as never);
    fake.sessions[0].expiresAt = new Date(Date.now() - 1000);
    expect(await service.validateSession(response.set[0].value)).toBeNull();
    expect(fake.sessions).toHaveLength(0);
  });
});
