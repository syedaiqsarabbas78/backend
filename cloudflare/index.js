const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const READY_ATTEMPTS = 90;
const READY_INTERVAL_MS = 2000;

export class ApiContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.starting = undefined;
    this.monitoring = undefined;
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
      this.observeExit();
    }
  }

  async fetch(request) {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container.getTcpPort(PORT).fetch(forwarded);
  }

  async startAndWaitForPort() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "basic",
        enableInternet: true,
        env: {
          PORT: String(PORT),
          NODE_ENV: "production",
          DATABASE_URL: this.env.DATABASE_URL,
          OPENAI_API_KEY: this.env.OPENAI_API_KEY ?? "",
          ALLOWED_ORIGINS: this.env.ALLOWED_ORIGINS ?? "http://localhost:3000",
          OPENAI_MODEL_CANDIDATES: this.env.OPENAI_MODEL_CANDIDATES ?? "gpt-4.1-mini,gpt-4o-mini",
          OPENAI_TIMEOUT_MS: this.env.OPENAI_TIMEOUT_MS ?? "60000",
          OPENAI_MAX_OUTPUT_TOKENS: this.env.OPENAI_MAX_OUTPUT_TOKENS ?? "1024",
        },
      });
    }
    this.observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(PORT);
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(5000),
        });
        await response.body?.cancel();
        if (response.ok) {
          return;
        }
      } catch {
        // Nest is still migrating or the port is not listening yet.
      }
      await scheduler.wait(READY_INTERVAL_MS);
    }
    throw new Error("Backend container did not become ready on port 8080");
  }

  observeExit() {
    if (this.monitoring) {
      return;
    }
    this.monitoring = this.ctx.container
      .monitor()
      .catch((error) => console.error("Container failed:", error))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
}

export default {
  async fetch(request, env) {
    return env.API_CONTAINER.getByName("harbor-api").fetch(request);
  },
};
