import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { ChatsModule } from "./chats/chats.module";
import { OriginMiddleware } from "./common/origin.middleware";
import { AppConfigModule } from "./config/app-config.module";
import { HealthModule } from "./health/health.module";
import { ModelsModule } from "./models/models.module";
import { OpenAiModule } from "./openai/openai.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: process.env.NODE_ENV === "test" ? 1000 : 10,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    OpenAiModule,
    ModelsModule,
    ChatsModule,
    HealthModule,
  ],
  providers: [OriginMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginMiddleware).forRoutes("*");
  }
}
