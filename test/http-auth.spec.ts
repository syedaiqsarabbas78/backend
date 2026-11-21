import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { FakePrisma } from "./fake-prisma";

describe("HTTP auth boundary", () => {
  let app: INestApplication;
  const fake = new FakePrisma();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("blocks unauthenticated chat access", async () => {
    await request(app.getHttpServer()).get("/chats").expect(401);
  });

  it("blocks signup without an allowed origin", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: "a@example.com", password: "password123" })
      .expect(403);
  });

  it("signs up, returns an HttpOnly cookie, and logs out", async () => {
    const created = await request(app.getHttpServer())
      .post("/auth/signup")
      .set("Origin", "http://localhost:3000")
      .send({ email: "Owner@Example.com", password: "password123" })
      .expect(201);

    expect(created.body.user.email).toBe("owner@example.com");
    expect(created.body.passwordHash).toBeUndefined();
    const header = created.headers["set-cookie"];
    const cookie = Array.isArray(header) ? header[0] : header;
    expect(cookie).toContain("session=");
    expect(cookie.toLowerCase()).toContain("httponly");

    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(200);
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", cookie)
      .expect(201);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie).expect(401);
  });
});
