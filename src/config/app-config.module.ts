import { Global, Module } from "@nestjs/common";
import { AppConfig, readConfig } from "./app-config";

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => readConfig() }],
  exports: [AppConfig],
})
export class AppConfigModule {}
