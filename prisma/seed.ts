import { PrismaClient } from "@prisma/client";
import { readConfig } from "../src/config/app-config";

function displayName(providerModelId: string): string {
  return providerModelId.replace(/^gpt/i, "GPT").replace(/-/g, " ");
}

async function main(): Promise<void> {
  const config = readConfig();
  const prisma = new PrismaClient();
  try {
    for (const providerModelId of config.modelCandidates) {
      await prisma.model.upsert({
        where: { providerModelId },
        update: { displayName: displayName(providerModelId), enabled: true },
        create: {
          providerModelId,
          displayName: displayName(providerModelId),
          enabled: true,
        },
      });
    }
    await prisma.model.updateMany({
      where: { providerModelId: { notIn: config.modelCandidates } },
      data: { enabled: false },
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Seed failed";
  console.error(message);
  process.exit(1);
});
