process.env.DATABASE_URL ??= "postgresql://chat:chat@127.0.0.1:5432/chat?schema=public";
process.env.NODE_ENV ??= "test";
process.env.ALLOWED_ORIGINS ??= "http://localhost:3000";
process.env.OPENAI_API_KEY ??= "";
process.env.OPENAI_MODEL_CANDIDATES ??= "gpt-4.1-mini,gpt-4o-mini";
