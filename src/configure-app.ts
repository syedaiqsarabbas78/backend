import { INestApplication, ValidationPipe } from "@nestjs/common";
import { json } from "express";
import cookieParser from "cookie-parser";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";

export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.use(json({ limit: "32kb" }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const http = app.getHttpAdapter().getInstance() as { set: (key: string, value: number) => void };
  http.set("trust proxy", 1);
}
