import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEnabled() {
    const models = await this.prisma.model.findMany({
      where: { enabled: true },
      orderBy: { displayName: "asc" },
    });
    return {
      models: models.map((model) => ({
        id: model.id,
        providerModelId: model.providerModelId,
        displayName: model.displayName,
      })),
    };
  }
}
